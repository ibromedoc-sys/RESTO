"""Read-only Firebase data access for the RESTO Android application."""

import hashlib
import json
import os
import ssl
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

import certifi


_FIREBASE_CONFIG = None
_REQUEST_TIMEOUT = 20

_COLLECTIONS = {
    "produits": (
        "nom",
        "prix",
        "description",
        "image",
        "image_2",
        "image_3",
        "telephone_commande",
    ),
    "publications": (
        "titre",
        "contenu",
        "date",
        "image",
        "image_2",
        "image_3",
    ),
}


class FirebaseError(RuntimeError):
    """Raised when Firebase configuration or a request fails."""


def _firebase_config():
    global _FIREBASE_CONFIG

    if _FIREBASE_CONFIG is None:
        config_path = Path(__file__).with_name("google-services.json")
        try:
            with config_path.open(encoding="utf-8") as config_file:
                data = json.load(config_file)
            client = data["client"][0]
            project_id = data["project_info"]["project_id"]
            api_key = client["api_key"][0]["current_key"]
            package_name = client["client_info"]["android_client_info"]["package_name"]
        except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
            raise FirebaseError(
                "Configuration Firebase invalide ou fichier google-services.json absent."
            ) from error

        if package_name != "com.resto.app":
            raise FirebaseError(
            "google-services.json ne correspond pas au package com.resto.app."
            )

        _FIREBASE_CONFIG = {
            "project_id": project_id,
            "api_key": api_key,
        }

    return _FIREBASE_CONFIG


def _decode_response(response):
    if not response:
        return {}
    try:
        return json.loads(response.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise FirebaseError("Firebase a renvoyé une réponse illisible.") from error


def _ssl_context():
    return ssl.create_default_context(cafile=certifi.where())


def _request_json(url, not_found_ok=False):
    request = Request(url, headers={"Accept": "application/json"}, method="GET")

    try:
        with urlopen(
            request, timeout=_REQUEST_TIMEOUT, context=_ssl_context()
        ) as response:
            return _decode_response(response.read())
    except HTTPError as error:
        if error.code == 404 and not_found_ok:
            return None
        response_data = _decode_response(error.read())
        message = response_data.get("error", {}).get("message")
        if error.code in (401, 403):
            detail = message or "accès refusé par les règles Firebase."
        else:
            detail = message or "erreur HTTP {}.".format(error.code)
        raise FirebaseError("Firebase : {}".format(detail)) from error
    except (URLError, TimeoutError, OSError) as error:
        raise FirebaseError(
            "Connexion Firebase impossible : {}".format(error)
        ) from error


def _firestore_collection_url(collection):
    config = _firebase_config()
    url = (
        "https://firestore.googleapis.com/v1/projects/{}/databases/(default)"
        "/documents/{}".format(config["project_id"], collection)
    )
    return "{}?{}".format(url, urlencode({"key": config["api_key"]}))


def _firestore_document_url(collection, document_id):
    config = _firebase_config()
    url = (
        "https://firestore.googleapis.com/v1/projects/{}/databases/(default)"
        "/documents/{}/{}".format(
            config["project_id"], collection, document_id
        )
    )
    return "{}?{}".format(url, urlencode({"key": config["api_key"]}))


def _decode_fields(fields, field_names):
    values = []
    for field_name in field_names:
        field = fields.get(field_name, {})
        value = field.get("stringValue", "")
        values.append("" if value is None else str(value))
    return values


def _list_documents(collection):
    documents = []
    url = _firestore_collection_url(collection)
    query = {"pageSize": 1000}

    while True:
        response = _request_json("{}&{}".format(url, urlencode(query)))
        documents.extend(response.get("documents", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break
        query["pageToken"] = page_token

    return documents


def _document_id(document):
    return document["name"].rsplit("/", 1)[-1]


def _timestamp_sort_value(document):
    value = document.get("fields", {}).get("_createdAt", {}).get("timestampValue")
    if value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except (TypeError, ValueError, OverflowError):
            pass

    date_value = document.get("fields", {}).get("date", {}).get("stringValue", "")
    try:
        return datetime.fromisoformat(
            date_value.replace("Z", "+00:00")
        ).timestamp()
    except (TypeError, ValueError, OverflowError):
        pass

    for date_format in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_value, date_format).replace(
                tzinfo=timezone.utc
            ).timestamp()
        except (TypeError, ValueError, OverflowError):
            pass
    return 0


def obtenir_produits():
    documents = _list_documents("produits")
    return [
        (
            _document_id(document),
            *_decode_fields(
                document.get("fields", {}), _COLLECTIONS["produits"]
            ),
        )
        for document in documents
    ]


def obtenir_publications():
    documents = _list_documents("publications")
    documents.sort(
        key=lambda document: (
            _timestamp_sort_value(document),
            _document_id(document),
        ),
        reverse=True,
    )
    return [
        (
            _document_id(document),
            *_decode_fields(
                document.get("fields", {}), _COLLECTIONS["publications"]
            ),
        )
        for document in documents
    ]


def obtenir_contenu_application():
    """Return the editable static content documents used by the app."""
    documents = _list_documents("contenu")
    return {
        _document_id(document): {
            field_name: field.get("stringValue", "")
            for field_name, field in document.get("fields", {}).items()
            if "stringValue" in field
        }
        for document in documents
    }


def obtenir_revision_tableau():
    """Return the Firestore update time for the dashboard change marker."""
    document = _request_json(
        _firestore_document_url("metadata", "dashboard"),
        not_found_ok=True,
    )
    return document.get("updateTime") if document else None


def image_locale(image_reference, cache_directory):
    """Resolve bundled legacy images or download Firebase Storage images safely."""
    if not image_reference:
        return ""

    parsed = urlparse(str(image_reference))
    if parsed.scheme not in ("http", "https"):
        image_path = Path(__file__).resolve().parent / str(image_reference)
        return str(image_path) if image_path.is_file() else ""

    if parsed.scheme != "https":
        raise FirebaseError("Les images distantes doivent utiliser HTTPS.")

    extension = Path(parsed.path).suffix.lower()
    if extension not in (".jpg", ".jpeg", ".png", ".webp"):
        extension = ""
    cache_name = hashlib.sha256(image_reference.encode("utf-8")).hexdigest()
    cache_folder = Path(cache_directory) / "images"
    if extension:
        cache_path = cache_folder / (cache_name + extension)
    else:
        cache_path = None
    if cache_path is not None and cache_path.is_file():
        return str(cache_path)

    request = Request(image_reference, headers={"Accept": "image/*"})
    try:
        with urlopen(
            request, timeout=_REQUEST_TIMEOUT, context=_ssl_context()
        ) as response:
            content_type = response.headers.get_content_type()
            extensions_by_type = {
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
            }
            response_extension = extensions_by_type.get(content_type)
            if response_extension is None:
                raise FirebaseError(
                    "Firebase Storage a renvoyé un type d'image non pris en charge."
                )
            cache_path = cache_folder / (cache_name + response_extension)
            if cache_path.is_file():
                return str(cache_path)
            content = response.read(5 * 1024 * 1024 + 1)
            if len(content) > 5 * 1024 * 1024:
                raise FirebaseError("L'image dépasse la taille maximale autorisée.")
    except HTTPError as error:
        raise FirebaseError(
            "Téléchargement de l'image impossible (HTTP {}).".format(error.code)
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise FirebaseError(
            "Téléchargement de l'image impossible : {}".format(error)
        ) from error

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = cache_path.with_suffix(cache_path.suffix + ".tmp")
    try:
        temporary_path.write_bytes(content)
        os.replace(str(temporary_path), str(cache_path))
    except OSError as error:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass
        raise FirebaseError(
            "Impossible d'enregistrer l'image dans le cache : {}".format(error)
        ) from error
    return str(cache_path)
