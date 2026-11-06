import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { dashboardAdminUid, firebaseConfig } from "./firebase-config.js";

const CLOUDINARY_CLOUD_NAME = "jvljzrue";
const CLOUDINARY_UPLOAD_PRESET = "vente_images";
const DEFAULT_ORDER_PHONE = "22899057931";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_CONTENT = {
  accueil: {
    accueil_titre: "La cuisine qui\nrassemble.",
    accueil_description: "Bienvenue chez Laur & Dor Gourmet. Découvrez la carte et les actualités de notre restaurant.",
    accueil_bouton_produits: "Découvrir la carte",
    accueil_bouton_infos: "Nos actualités",
    logo_1: "images/logo.png",
    logo_2: "images/logo1.png",
    logo_3: "images/logo2.png",
    logo_4: "images/logo3.png",
  },
  apropos: {
    apropos_titre: "À propos de Laur & Dor Gourmet",
    apropos_description: "Un restaurant où découvrir une cuisine généreuse et partager un bon moment.",
    apropos_lien_texte: "SITE OFFICIEL",
    apropos_lien_url: "",
    apropos_contact_texte: "CONTACT",
    apropos_contact_url: "",
    telephone_contact: DEFAULT_ORDER_PHONE,
    photo: "",
  },
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (selector, root = document) => root.querySelector(selector);
const records = { produits: [], publications: [] };
const currentContent = {
  accueil: { ...DEFAULT_CONTENT.accueil },
  apropos: { ...DEFAULT_CONTENT.apropos },
};
const previewObjectUrls = new WeakMap();
let unsubscribeProducts;
let unsubscribeNews;
let unsubscribeHomeContent;
let unsubscribeAboutContent;
let noticeTimeout;

const loginView = $("#login-view");
const loadingView = $("#loading-view");
const adminApp = $("#admin-app");
const loginForm = $("#login-form");
const notice = $("#notice");
const loginNotice = $("#login-notice");
const productForm = $("#product-form");
const newsForm = $("#news-form");

function showNotice(message, kind = "error") {
  const target = loginView.hidden ? notice : loginNotice;
  target.textContent = message;
  target.className = `notice ${kind}`;
  target.hidden = false;
  window.clearTimeout(noticeTimeout);
  noticeTimeout = window.setTimeout(() => {
    target.hidden = true;
  }, 8000);
}

function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez plus tard.",
    "auth/network-request-failed": "Connexion impossible. Vérifiez votre accès à Internet.",
    "permission-denied": "Accès refusé par les règles de sécurité Firebase.",
    "storage/unauthorized": "Le téléversement est refusé. Vérifiez les permissions de stockage.",
  };
  return messages[error.code] || error.message || "Une erreur inattendue est survenue.";
}

function stopListeners() {
  [unsubscribeProducts, unsubscribeNews, unsubscribeHomeContent, unsubscribeAboutContent]
    .forEach((unsubscribe) => unsubscribe?.());
  unsubscribeProducts = undefined;
  unsubscribeNews = undefined;
  unsubscribeHomeContent = undefined;
  unsubscribeAboutContent = undefined;
}

function setAuthenticatedView(isAuthenticated) {
  loadingView.hidden = true;
  loginView.hidden = isAuthenticated;
  adminApp.hidden = !isAuthenticated;
}

function safeHttpsUrl(value, label) {
  const urlValue = value.trim();
  if (!urlValue) return "";
  try {
    const url = new URL(urlValue);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    // Report the same validation message for invalid or non-HTTPS URLs.
  }
  throw new Error(`${label} doit être une URL HTTPS valide.`);
}

function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function homeLogoPreviewUrl(value) {
  const url = imageUrl(value);
  if (url) return url;
  const localImage = String(value).match(/^images\/([\w.-]+)$/i);
  return localImage ? `./assets/${localImage[1]}` : "";
}

function updateImagePreview(field, source, caption = "") {
  const previousUrl = previewObjectUrls.get(field);
  if (previousUrl) URL.revokeObjectURL(previousUrl);

  const preview = $(".image-preview", field);
  const image = $("img", preview);
  const captionElement = $("span", preview);
  if (!source) {
    image.removeAttribute("src");
    captionElement.textContent = "";
    preview.hidden = true;
    previewObjectUrls.delete(field);
    return;
  }

  image.src = source;
  captionElement.textContent = caption;
  preview.hidden = false;
  if (source.startsWith("blob:")) previewObjectUrls.set(field, source);
  else previewObjectUrls.delete(field);
}

function imageSource(field) {
  const fileInput = $('input[type="file"]', field);
  const urlInput = $('input[type="url"]', field);
  if (fileInput.files[0]) {
    const objectUrl = URL.createObjectURL(fileInput.files[0]);
    updateImagePreview(field, objectUrl, fileInput.files[0].name);
    return;
  }
  const enteredUrl = imageUrl(urlInput.value.trim());
  if (enteredUrl) {
    updateImagePreview(field, enteredUrl, "Aperçu de l’image");
    return;
  }
  const existingImage = field.dataset.currentImage || "";
  updateImagePreview(field, existingImage, existingImage ? "Image actuelle" : "");
}

function bindImagePreviews() {
  document.querySelectorAll("[data-image-field]").forEach((field) => {
    $('input[type="file"]', field).addEventListener("change", () => imageSource(field));
    $('input[type="url"]', field).addEventListener("input", () => imageSource(field));
  });
  document.querySelectorAll("[data-home-logo-field]").forEach((field) => {
    const referenceInput = $("[data-logo-reference]", field);
    const fileInput = $("[data-logo-file]", field);
    referenceInput.addEventListener("input", () => {
      const source = homeLogoPreviewUrl(referenceInput.value.trim());
      updateImagePreview(field, source, source ? "Aperçu de l’image" : "");
    });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      updateImagePreview(field, URL.createObjectURL(file), file.name);
    });
  });
}

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choisissez une image JPEG, PNG ou WebP.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Chaque image doit faire 5 Mo maximum.");
  }
}

async function uploadImage(file) {
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body },
  );
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Réponse Cloudinary invalide (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(result.error?.message || `Échec du téléversement (HTTP ${response.status}).`);
  }
  const secureUrl = imageUrl(result.secure_url || "");
  if (!secureUrl) throw new Error("Cloudinary n’a pas renvoyé d’URL HTTPS valide.");
  return secureUrl;
}

async function getImageValues(form, oldRecord = {}) {
  const values = {};
  for (const field of form.querySelectorAll("[data-image-field]")) {
    const name = field.dataset.imageField;
    const file = $('input[type="file"]', field).files[0] || null;
    const url = $('input[type="url"]', field).value.trim();
    if (file) validateImageFile(file);
    if (!file && url && !imageUrl(url)) {
      throw new Error("Chaque image doit être une URL HTTPS valide.");
    }
    values[name] = file ? await uploadImage(file) : url ? imageUrl(url) : oldRecord[name] || "";
  }
  return values;
}

async function markDashboardUpdated() {
  try {
    await setDoc(doc(db, "metadata", "dashboard"), { updatedAt: serverTimestamp() });
  } catch (error) {
    showNotice(`Le contenu a été enregistré, mais l’indicateur de mise à jour n’a pas pu être actualisé : ${friendlyError(error)}`, "warning");
  }
}

function recordTitle(type, item) {
  return type === "produits" ? item.nom || "Produit sans nom" : item.titre || "Actualité sans titre";
}

function sortRecords(items) {
  return [...items].sort((left, right) => {
    const leftDate = left._createdAt?.toMillis?.() || dateSortValue(left.date) || 0;
    const rightDate = right._createdAt?.toMillis?.() || dateSortValue(right.date) || 0;
    return rightDate - leftDate;
  });
}

function dateSortValue(value) {
  const parsed = Date.parse(value || "");
  if (Number.isFinite(parsed)) return parsed;
  const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value || "");
  if (!match) return 0;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function renderRecords(type) {
  const isProduct = type === "produits";
  const list = isProduct ? $("#product-list") : $("#news-list");
  const count = isProduct ? $("#product-list-count") : $("#news-list-count");
  const summaryCount = isProduct ? $("#product-count") : $("#news-count");
  const total = isProduct ? $("#product-total") : $("#news-total");
  const items = sortRecords(records[type]);

  count.textContent = String(items.length);
  summaryCount.textContent = String(items.length);
  total.textContent = String(items.length);
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = isProduct
      ? "Aucun produit pour le moment. Ajoutez votre premier produit avec le formulaire."
      : "Aucune actualité publiée. Partagez votre première information.";
    list.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "record";
    const thumbnailUrl = imageUrl(item.image || "");
    if (thumbnailUrl) {
      const thumbnail = document.createElement("img");
      thumbnail.className = "record-image";
      thumbnail.src = thumbnailUrl;
      thumbnail.alt = "";
      thumbnail.loading = "lazy";
      row.append(thumbnail);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "record-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = "✧";
      row.append(placeholder);
    }

    const copy = document.createElement("div");
    copy.className = "record-copy";
    const title = document.createElement("strong");
    title.textContent = recordTitle(type, item);
    const subtitle = document.createElement("span");
    subtitle.textContent = isProduct
      ? [item.categorie || "Restaurant", item.prix || ""].filter(Boolean).join(" · ")
      : item.date || "";
    copy.append(title, subtitle);

    const actions = document.createElement("div");
    actions.className = "record-actions";
    const editButton = document.createElement("button");
    editButton.className = "record-action";
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.type = type;
    editButton.dataset.id = item.id;
    editButton.textContent = "Modifier";
    editButton.setAttribute("aria-label", `Modifier ${recordTitle(type, item)}`);
    const deleteButton = document.createElement("button");
    deleteButton.className = "record-action danger";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.type = type;
    deleteButton.dataset.id = item.id;
    deleteButton.textContent = "Supprimer";
    deleteButton.setAttribute("aria-label", `Supprimer ${recordTitle(type, item)}`);
    actions.append(editButton, deleteButton);
    row.append(copy, actions);
    list.append(row);
  });
}

function populateContentForm(section, data = {}) {
  const form = section === "accueil" ? $("#home-content-form") : $("#about-content-form");
  currentContent[section] = { ...DEFAULT_CONTENT[section], ...data };
  form.querySelectorAll("[data-content-field]").forEach((input) => {
    input.value = currentContent[section][input.name] || "";
  });
  if (section === "accueil") {
    form.querySelectorAll("[data-home-logo-field]").forEach((field) => {
      const input = $("[data-logo-reference]", field);
      const fileInput = $("[data-logo-file]", field);
      const source = homeLogoPreviewUrl(input.value);
      fileInput.value = "";
      field.dataset.currentImage = input.value;
      updateImagePreview(field, source, source ? "Image actuelle" : "");
    });
  }
}

function watchData() {
  stopListeners();
  unsubscribeProducts = onSnapshot(
    collection(db, "produits"),
    (snapshot) => {
      records.produits = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderRecords("produits");
    },
    (error) => showNotice(`Chargement des produits impossible : ${friendlyError(error)}`),
  );
  unsubscribeNews = onSnapshot(
    collection(db, "publications"),
    (snapshot) => {
      records.publications = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderRecords("publications");
    },
    (error) => showNotice(`Chargement des actualités impossible : ${friendlyError(error)}`),
  );
  unsubscribeHomeContent = onSnapshot(
    doc(db, "contenu", "accueil"),
    (snapshot) => populateContentForm("accueil", snapshot.exists() ? snapshot.data() : {}),
    (error) => showNotice(`Chargement de l’accueil impossible : ${friendlyError(error)}`),
  );
  unsubscribeAboutContent = onSnapshot(
    doc(db, "contenu", "apropos"),
    (snapshot) => populateContentForm("apropos", snapshot.exists() ? snapshot.data() : {}),
    (error) => showNotice(`Chargement des informations impossible : ${friendlyError(error)}`),
  );
}

function resetRecordForm(form) {
  form.querySelectorAll("[data-image-field]").forEach((field) => {
    field.dataset.currentImage = "";
    updateImagePreview(field, "");
  });
  form.reset();
  form.elements.id.value = "";
  if (form === productForm) {
    form.elements.telephone_commande.value =
      currentContent.apropos.telephone_contact || DEFAULT_ORDER_PHONE;
    $("#product-form-title").textContent = "Ajouter un produit";
    setSubmitLabel(form, "Enregistrer le produit");
  } else {
    $("#news-form-title").textContent = "Nouvelle actualité";
    setSubmitLabel(form, "Publier l’actualité");
  }
  $('[data-cancel]', form).hidden = true;
}

function setSubmitLabel(form, label) {
  $('button[type="submit"]', form).firstChild.textContent = `${label} `;
}

async function saveRecord(type, form, event) {
  event.preventDefault();
  const isProduct = type === "produits";
  const formData = new FormData(form);
  const existingId = form.elements.id.value;
  const oldRecord = records[type].find((item) => item.id === existingId) || {};
  const submitButton = $('button[type="submit"]', form);
  submitButton.disabled = true;
  try {
    const values = isProduct
      ? {
          nom: String(formData.get("nom") || "").trim(),
          categorie: String(formData.get("categorie") || "").trim(),
          prix: String(formData.get("prix") || "").trim(),
          description: String(formData.get("description") || "").trim(),
          telephone_commande: String(formData.get("telephone_commande") || "").trim(),
        }
      : {
          titre: String(formData.get("titre") || "").trim(),
          contenu: String(formData.get("contenu") || "").trim(),
          date: String(formData.get("date") || new Date().toISOString().slice(0, 10)),
        };
    if (!values[isProduct ? "nom" : "titre"]) {
      throw new Error(isProduct ? "Le nom du produit est obligatoire." : "Le titre de l’actualité est obligatoire.");
    }
    if (isProduct) {
      const digits = values.telephone_commande.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) {
        throw new Error("Saisissez un numéro WhatsApp international valide (8 à 15 chiffres).");
      }
    }
    Object.assign(values, await getImageValues(form, oldRecord));
    const collectionRef = collection(db, type);
    if (existingId) {
      await updateDoc(doc(collectionRef, existingId), values);
    } else {
      if (!isProduct) values._createdAt = serverTimestamp();
      await setDoc(doc(collectionRef, crypto.randomUUID()), values);
    }
    await markDashboardUpdated();
    showNotice(existingId ? "Modifications enregistrées." : `${isProduct ? "Produit" : "Actualité"} ajouté(e).`, "success");
    resetRecordForm(form);
  } catch (error) {
    showNotice(friendlyError(error));
  } finally {
    submitButton.disabled = false;
  }
}

function editRecord(type, id) {
  const item = records[type].find((record) => record.id === id);
  if (!item) {
    showNotice("Cet élément n’est plus disponible. Actualisez la page et réessayez.");
    return;
  }
  const form = type === "produits" ? productForm : newsForm;
  form.elements.id.value = item.id;
  form.querySelectorAll("[data-image-field]").forEach((field) => {
    const source = item[field.dataset.imageField] || "";
    field.dataset.currentImage = source;
    $('input[type="url"]', field).value = "";
    $('input[type="file"]', field).value = "";
    updateImagePreview(field, source, source ? "Image actuelle" : "");
  });
  if (type === "produits") {
    form.elements.nom.value = item.nom || "";
    form.elements.categorie.value = item.categorie || item.category || "";
    form.elements.prix.value = item.prix || "";
    form.elements.description.value = item.description || "";
    form.elements.telephone_commande.value = item.telephone_commande || DEFAULT_ORDER_PHONE;
    $("#product-form-title").textContent = "Modifier le produit";
    setSubmitLabel(form, "Enregistrer les modifications");
  } else {
    form.elements.titre.value = item.titre || "";
    form.elements.contenu.value = item.contenu || "";
    form.elements.date.value = item.date || "";
    $("#news-form-title").textContent = "Modifier l’actualité";
    setSubmitLabel(form, "Enregistrer les modifications");
  }
  $('[data-cancel]', form).hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(type, id) {
  const item = records[type].find((record) => record.id === id);
  if (!item || !window.confirm(`Supprimer « ${recordTitle(type, item)} » ?`)) return;
  try {
    await deleteDoc(doc(db, type, id));
    await markDashboardUpdated();
    showNotice("Élément supprimé.", "success");
  } catch (error) {
    showNotice(friendlyError(error));
  }
}

async function saveContent(section, form, event) {
  event.preventDefault();
  const submitButton = $('button[type="submit"]', form);
  submitButton.disabled = true;
  try {
    const values = {};
    form.querySelectorAll("[data-content-field]").forEach((input) => {
      values[input.name] = input.value.trim();
    });
    if (section === "accueil") {
      for (let index = 1; index <= 4; index += 1) {
        const name = `logo_${index}`;
        const file = form.elements[`logoFile_${index}`].files[0];
        const reference = values[name];
        if (file) {
          validateImageFile(file);
          values[name] = await uploadImage(file);
        } else if (reference && !imageUrl(reference) && !/^images\/[\w.-]+$/i.test(reference)) {
          throw new Error("Chaque image du carrousel doit être une URL HTTPS ou un chemin images/ valide.");
        }
      }
    }
    if (section === "apropos") {
      const contactPhone = String(values.telephone_contact || "").replace(/\D/g, "");
      if (contactPhone.length < 8 || contactPhone.length > 15) {
        throw new Error("Saisissez un numéro WhatsApp international valide (8 à 15 chiffres).");
      }
      values.telephone_contact = contactPhone;
      values.apropos_lien_url = safeHttpsUrl(values.apropos_lien_url || "", "Le site officiel");
      values.apropos_contact_url = safeHttpsUrl(values.apropos_contact_url || "", "Le lien de contact");
      values.photo = safeHttpsUrl(values.photo || "", "La photo");
    }
    await setDoc(doc(db, "contenu", section), values, { merge: true });
    currentContent[section] = { ...currentContent[section], ...values };
    await markDashboardUpdated();
    showNotice("Contenu enregistré.", "success");
  } catch (error) {
    showNotice(friendlyError(error));
  } finally {
    submitButton.disabled = false;
  }
}

function openPanel(panelId) {
  document.querySelectorAll(".management-panel").forEach((panel) => {
    panel.hidden = panel.id !== panelId;
  });
  document.querySelectorAll("[data-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panelId);
  });
  const titles = {
    "products-panel": "Gestion des produits",
    "news-panel": "Actualités & publications",
    "content-panel": "Contenu du site",
  };
  $("#page-title").firstChild.textContent = `${titles[panelId]} `;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $('button[type="submit"]', loginForm);
  button.disabled = true;
  try {
    await signInWithEmailAndPassword(
      auth,
      loginForm.elements.email.value.trim(),
      loginForm.elements.password.value,
    );
  } catch (error) {
    showNotice(friendlyError(error));
  } finally {
    button.disabled = false;
  }
});

$("#sign-out").addEventListener("click", async () => {
  stopListeners();
  try {
    await signOut(auth);
  } catch (error) {
    showNotice(friendlyError(error));
  }
});

document.querySelectorAll("[data-panel]").forEach((button) => {
  button.addEventListener("click", () => openPanel(button.dataset.panel));
});
document.querySelectorAll("[data-record-form]").forEach((form) => {
  form.addEventListener("submit", (event) => saveRecord(form.dataset.recordForm, form, event));
});
document.querySelectorAll("[data-content-form]").forEach((form) => {
  form.addEventListener("submit", (event) => saveContent(form.dataset.contentForm, form, event));
});
document.querySelectorAll("[data-cancel]").forEach((button) => {
  button.addEventListener("click", () => resetRecordForm(button.closest("form")));
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit") editRecord(button.dataset.type, button.dataset.id);
  if (button.dataset.action === "delete") deleteRecord(button.dataset.type, button.dataset.id);
});
bindImagePreviews();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    stopListeners();
    setAuthenticatedView(false);
    return;
  }
  if (user.uid !== dashboardAdminUid) {
    try {
      await signOut(auth);
      setAuthenticatedView(false);
      showNotice("Ce compte n’est pas autorisé à administrer RESTO.");
    } catch (error) {
      setAuthenticatedView(false);
      showNotice(`Compte non autorisé. Déconnexion impossible : ${friendlyError(error)}`);
    }
    return;
  }
  setAuthenticatedView(true);
  $("#admin-email").textContent = user.email || "Administrateur";
  watchData();
});

openPanel("products-panel");
