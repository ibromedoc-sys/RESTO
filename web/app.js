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
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_ORDER_PHONE = "22899057931";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (selector) => document.querySelector(selector);

const notice = $("#notice");
const loginPanel = $("#login-panel");
const dashboard = $("#dashboard");
const signOutButton = $("#sign-out");
const productForm = $("#product-form");
const publicationForm = $("#publication-form");
const records = { produits: [], publications: [] };
const defaultContent = {
  accueil: {
    accueil_titre: "Bienvenue chez Laur & Dor Gourmet",
    accueil_description: "Découvrez la carte et les actualités de notre restaurant.",
    accueil_bouton_produits: "LA CARTE",
    accueil_bouton_infos: "NOS INFOS",
    logo_1: "images/logo.png",
    logo_2: "images/logo1.png",
    logo_3: "images/logo2.png",
    logo_4: "images/logo3.png",
  },
  apropos: {
    infos_titre: "INFOS & ACTUALITÃ‰S",
    apropos_titre: "À propos de Laur & Dor Gourmet",
    apropos_description:
      "Un restaurant où découvrir une cuisine généreuse et partager un bon moment.",
    apropos_lien_texte: "RESTO WEB",
    apropos_lien_url: "https://laur-dor.web.app",
    apropos_contact_texte: "CONTACT",
    apropos_contact_url: "https://laur-dor.web.app",
    photo: "",
  },
};
const content = {
  accueil: { ...defaultContent.accueil },
  apropos: { ...defaultContent.apropos },
};
let unsubscribeProducts;
let unsubscribePublications;
let unsubscribeHomeContent;
let unsubscribeAboutContent;
let noticeTimeout;
const previewObjectUrls = new WeakMap();
const contentPreviewObjectUrls = new WeakMap();

function showNotice(message, kind = "error") {
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  window.clearTimeout(noticeTimeout);
  noticeTimeout = window.setTimeout(() => notice.classList.add("hidden"), 7000);
}

function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "Adresse e-mail ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. RÃ©essayez plus tard.",
    "permission-denied": "AccÃ¨s refusÃ© par les rÃ¨gles Firebase.",
  };
  return messages[error.code] || error.message || "Une erreur inattendue est survenue.";
}

function setSignedIn(visible) {
  loginPanel.classList.toggle("hidden", visible);
  dashboard.classList.toggle("hidden", !visible);
  signOutButton.classList.toggle("hidden", !visible);
}

function stopListeners() {
  if (unsubscribeProducts) unsubscribeProducts();
  if (unsubscribePublications) unsubscribePublications();
  if (unsubscribeHomeContent) unsubscribeHomeContent();
  if (unsubscribeAboutContent) unsubscribeAboutContent();
  unsubscribeProducts = undefined;
  unsubscribePublications = undefined;
  unsubscribeHomeContent = undefined;
  unsubscribeAboutContent = undefined;
}

function watchRecords() {
  stopListeners();
  unsubscribeProducts = onSnapshot(
    collection(db, "produits"),
    (snapshot) => {
      records.produits = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));
      renderRecords("produits");
    },
    (error) => showNotice(friendlyError(error)),
  );
  unsubscribePublications = onSnapshot(
    collection(db, "publications"),
    (snapshot) => {
      records.publications = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));
      renderRecords("publications");
    },
    (error) => showNotice(friendlyError(error)),
  );
  watchContent();
}

function setContentImagePreview(container, source, caption = "") {
  const previousObjectUrl = contentPreviewObjectUrls.get(container);
  if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);

  const image = container.querySelector("img");
  const captionElement = container.querySelector("[data-content-caption]");
  const previewUrl = imagePreviewUrl(source);
  if (!source) {
    image.removeAttribute("src");
    captionElement.textContent = "";
    container.classList.add("hidden");
    contentPreviewObjectUrls.delete(container);
    return;
  }

  if (previewUrl || source.startsWith("blob:")) image.src = source;
  else image.removeAttribute("src");
  captionElement.textContent = caption;
  container.classList.remove("hidden");
  if (source.startsWith("blob:")) contentPreviewObjectUrls.set(container, source);
  else contentPreviewObjectUrls.delete(container);
}

function populateContentForm(section, data = null) {
  content[section] = data
    ? { ...defaultContent[section], ...data }
    : { ...defaultContent[section] };
  const form = section === "accueil"
    ? $("#home-content-form") : $("#about-content-form");

  for (const input of form.querySelectorAll("[data-content-text]")) {
    input.value = content[section][input.name] ?? "";
  }
  for (const field of form.querySelectorAll("[data-content-image]")) {
    const imageReference = content[section][field.dataset.contentImage] || "";
    field.dataset.currentImage = imageReference;
    setContentImagePreview(
      field.querySelector("[data-content-preview]"),
      imageReference,
      imageReference ? `Image actuelle : ${imageReference}` : "",
    );
  }
}

function watchContent() {
  unsubscribeHomeContent = onSnapshot(
    doc(db, "contenu", "accueil"),
    (snapshot) => populateContentForm(
      "accueil", snapshot.exists() ? snapshot.data() : null,
    ),
    (error) => showNotice(friendlyError(error)),
  );
  unsubscribeAboutContent = onSnapshot(
    doc(db, "contenu", "apropos"),
    (snapshot) => populateContentForm(
      "apropos", snapshot.exists() ? snapshot.data() : null,
    ),
    (error) => showNotice(friendlyError(error)),
  );
}

async function saveContent(section, form, event) {
  event.preventDefault();
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    const values = { ...content[section] };
    for (const input of form.querySelectorAll("[data-content-text]")) {
      values[input.name] = input.value;
    }
    if (section === "apropos") {
      const websiteUrl = imagePreviewUrl(values.apropos_lien_url.trim());
      if (!websiteUrl) {
        throw new Error("La destination du lien doit Ãªtre une URL HTTPS valide.");
      }
      values.apropos_lien_url = websiteUrl;
      const contactUrl = imagePreviewUrl(values.apropos_contact_url.trim());
      if (!contactUrl) {
        throw new Error("La destination du contact doit Ãªtre une URL HTTPS valide.");
      }
      values.apropos_contact_url = contactUrl;
    }
    for (const field of form.querySelectorAll("[data-content-image]")) {
      const imageName = field.dataset.contentImage;
      const imageFile = form.elements[`file_${imageName}`].files[0] || null;
      const enteredImageUrl =
        form.elements[`url_${imageName}`].value.trim();
      if (imageFile) validateImageFile(imageFile);
      if (!imageFile && enteredImageUrl &&
          !imagePreviewUrl(enteredImageUrl)) {
        throw new Error("Lâ€™image doit Ãªtre une URL HTTPS publique valide.");
      }
      values[imageName] = imageFile
        ? await uploadImage(imageFile)
        : enteredImageUrl || field.dataset.currentImage ||
          defaultContent[section][imageName];
    }

    await setDoc(doc(db, "contenu", section), values, { merge: true });
    await signalerModificationTableau();
    content[section] = values;
    for (const field of form.querySelectorAll("[data-content-image]")) {
      const imageReference = values[field.dataset.contentImage];
      field.dataset.currentImage = imageReference;
      field.querySelector('input[type="file"]').value = "";
      field.querySelector('input[type="url"]').value = "";
      setContentImagePreview(
        field.querySelector("[data-content-preview]"),
        imageReference,
        imageReference ? `Image actuelle : ${imageReference}` : "",
      );
    }
    showNotice("Contenu enregistrÃ©.", "success");
  } catch (error) {
    showNotice(friendlyError(error));
  } finally {
    submitButton.disabled = false;
  }
}

populateContentForm("accueil");
populateContentForm("apropos");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function recordTitle(type, item) {
  return type === "produits" ? item.nom || "Produit sans nom" :
    item.titre || "Publication sans titre";
}

function imagePreviewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href : "";
  } catch {
    return "";
  }
}

function setImagePreview(container, source, caption = "") {
  const previousObjectUrl = previewObjectUrls.get(container);
  if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);

  const image = container.querySelector("img");
  const captionElement = container.querySelector("[data-image-caption]");
  if (!source) {
    image.removeAttribute("src");
    captionElement.textContent = "";
    container.classList.add("hidden");
    previewObjectUrls.delete(container);
    return;
  }

  image.src = source;
  captionElement.textContent = caption;
  container.classList.remove("hidden");
  if (source.startsWith("blob:")) previewObjectUrls.set(container, source);
  else previewObjectUrls.delete(container);
}

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choisissez une image JPEG, PNG ou WebP.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Lâ€™image ne doit pas dÃ©passer 5 Mo pour rester compatible avec Android.");
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
    throw new Error(`RÃ©ponse Cloudinary invalide (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(result.error?.message || `Ã‰chec du tÃ©lÃ©versement Cloudinary (HTTP ${response.status}).`);
  }

  const secureUrl = imagePreviewUrl(result.secure_url || "");
  if (!secureUrl) {
    throw new Error("Cloudinary nâ€™a pas renvoyÃ© dâ€™URL HTTPS valide pour lâ€™image.");
  }
  return secureUrl;
}

function renderRecords(type) {
  const isProduct = type === "produits";
  const list = isProduct ? $("#product-list") : $("#publication-list");
  const count = isProduct ? $("#product-count") : $("#publication-count");
  const sorted = [...records[type]].sort((left, right) => {
    const leftDate = left._createdAt?.toMillis?.() || Date.parse(left.date) || 0;
    const rightDate = right._createdAt?.toMillis?.() || Date.parse(right.date) || 0;
    return rightDate - leftDate;
  });
  count.textContent = String(sorted.length);
  list.replaceChildren();

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aucun Ã©lÃ©ment pour le moment.";
    list.append(empty);
    return;
  }

  for (const item of sorted) {
    const row = document.createElement("article");
    row.className = "record";
    const secondary = isProduct
      ? [item.prix || "", item.telephone_commande || DEFAULT_ORDER_PHONE]
        .filter(Boolean).join(" Â· ")
      : item.date || "";
    const imageUrl = imagePreviewUrl(item.image || "");
    row.innerHTML = `
      ${imageUrl ? `<img class="record-image" src="${escapeHtml(imageUrl)}" alt="">` :
        '<span class="record-placeholder" aria-hidden="true"></span>'}
      <div class="record-copy">
        <strong>${escapeHtml(recordTitle(type, item))}</strong>
        <span>${escapeHtml(secondary)}</span>
      </div>
      <div class="record-actions">
        <button class="icon-button" type="button" data-action="edit"
                data-type="${type}" data-id="${escapeHtml(item.id)}"
                aria-label="Modifier ${escapeHtml(recordTitle(type, item))}">
          Modifier
        </button>
        <button class="icon-button danger" type="button" data-action="delete"
                data-type="${type}" data-id="${escapeHtml(item.id)}"
                aria-label="Supprimer ${escapeHtml(recordTitle(type, item))}">
          Supprimer
        </button>
      </div>`;
    list.append(row);
  }
}

function recordIdFor(form) {
  return form.elements.id.value || crypto.randomUUID();
}

async function signalerModificationTableau() {
  try {
    await setDoc(doc(db, "metadata", "dashboard"), {
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(
      `Modification enregistrÃ©e, mais lâ€™indicateur de mise Ã  jour a Ã©chouÃ© : ${friendlyError(error)}`,
    );
  }
}

async function saveRecord(type, form, event) {
  event.preventDefault();
  const isProduct = type === "produits";
  const formData = new FormData(form);
  const existingId = form.elements.id.value;
  const recordId = recordIdFor(form);
  const oldRecord = records[type].find((item) => item.id === existingId);
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    const values = isProduct
      ? {
          nom: String(formData.get("nom")).trim(),
          prix: String(formData.get("prix")).trim(),
          description: String(formData.get("description")).trim(),
          telephone_commande: String(formData.get("telephone_commande")).trim(),
        }
      : {
          titre: String(formData.get("titre")).trim(),
          contenu: String(formData.get("contenu")).trim(),
          date: String(formData.get("date")) || new Date().toISOString().slice(0, 10),
        };
    if (!values[isProduct ? "nom" : "titre"]) {
      throw new Error(isProduct ? "Le nom est obligatoire." : "Le titre est obligatoire.");
    }
    if (isProduct) {
      const phoneDigits = values.telephone_commande.replace(/\D/g, "");
      if (phoneDigits.length < 8 || phoneDigits.length > 15) {
        throw new Error("Saisissez un numÃ©ro WhatsApp international valide (8 Ã  15 chiffres).");
      }
    }
    for (const field of form.querySelectorAll("[data-record-image]")) {
      const imageName = field.dataset.recordImage;
      const imageFile = form.elements[`imageFile_${imageName}`].files[0] || null;
      const enteredImageUrl = String(
        formData.get(`imageUrl_${imageName}`) || "",
      ).trim();
      if (imageFile) validateImageFile(imageFile);
      if (!imageFile && enteredImageUrl && !imagePreviewUrl(enteredImageUrl)) {
        throw new Error("Chaque image doit Ãªtre une URL HTTPS publique valide.");
      }
      values[imageName] = imageFile
        ? await uploadImage(imageFile)
        : enteredImageUrl || oldRecord?.[imageName] || "";
    }

    const collectionRef = collection(db, type);
    if (existingId) {
      await updateDoc(doc(collectionRef, existingId), values);
    } else {
      if (type === "publications") values._createdAt = serverTimestamp();
      await setDoc(doc(collectionRef, recordId), values);
    }
    await signalerModificationTableau();
    showNotice(
      existingId ? "Modifications enregistrÃ©es." : "Ã‰lÃ©ment ajoutÃ©.",
      "success",
    );
    resetForm(form);
  } catch (error) {
    showNotice(friendlyError(error));
  } finally {
    submitButton.disabled = false;
  }
}

function resetForm(form) {
  for (const field of form.querySelectorAll("[data-record-image]")) {
    field.dataset.currentImage = "";
    setImagePreview(field.querySelector("[data-record-image-preview]"), "");
  }
  form.reset();
  form.elements.id.value = "";
  $(`#${form.getAttribute("id")}-title`).textContent = form === productForm
    ? "Ajouter un produit" : "Ajouter une publication";
  form.querySelector('[data-cancel]')?.classList.add("hidden");
}

function editRecord(type, id) {
  const item = records[type].find((record) => record.id === id);
  if (!item) {
    showNotice("Cet Ã©lÃ©ment n'est plus disponible.");
    return;
  }
  const form = type === "produits" ? productForm : publicationForm;
  form.elements.id.value = item.id;
  for (const field of form.querySelectorAll("[data-record-image]")) {
    const imageName = field.dataset.recordImage;
    const imageUrl = imagePreviewUrl(item[imageName] || "");
    field.dataset.currentImage = item[imageName] || "";
    form.elements[`imageUrl_${imageName}`].value = "";
    form.elements[`imageFile_${imageName}`].value = "";
    setImagePreview(
      field.querySelector("[data-record-image-preview]"),
      imageUrl,
      imageUrl ? "Image actuelle" : "",
    );
  }
  if (type === "produits") {
    form.elements.nom.value = item.nom || "";
    form.elements.prix.value = item.prix || "";
    form.elements.description.value = item.description || "";
    form.elements.telephone_commande.value =
      item.telephone_commande || DEFAULT_ORDER_PHONE;
    $("#product-form-title").textContent = "Modifier le produit";
  } else {
    form.elements.titre.value = item.titre || "";
    form.elements.contenu.value = item.contenu || "";
    form.elements.date.value = item.date || "";
    $("#publication-form-title").textContent = "Modifier la publication";
  }
  form.querySelector('[data-cancel]').classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(type, id) {
  const item = records[type].find((record) => record.id === id);
  if (!item || !window.confirm(`Supprimer Â« ${recordTitle(type, item)} Â» ?`)) return;
  try {
    await deleteDoc(doc(db, type, id));
    await signalerModificationTableau();
    showNotice("Ã‰lÃ©ment supprimÃ©.", "success");
  } catch (error) {
    showNotice(friendlyError(error));
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await signInWithEmailAndPassword(
      auth,
      form.elements.email.value.trim(),
      form.elements.password.value,
    );
  } catch (error) {
    showNotice(friendlyError(error));
  }
});

signOutButton.addEventListener("click", async () => {
  try {
    stopListeners();
    await signOut(auth);
  } catch (error) {
    showNotice(friendlyError(error));
  }
});

productForm.addEventListener("submit", (event) => saveRecord("produits", productForm, event));
publicationForm.addEventListener("submit", (event) =>
  saveRecord("publications", publicationForm, event));
$("#home-content-form").addEventListener("submit", (event) =>
  saveContent("accueil", event.currentTarget, event));
$("#about-content-form").addEventListener("submit", (event) =>
  saveContent("apropos", event.currentTarget, event));

for (const form of [productForm, publicationForm]) {
  for (const field of form.querySelectorAll("[data-record-image]")) {
    const imageName = field.dataset.recordImage;
    const urlInput = form.elements[`imageUrl_${imageName}`];
    const fileInput = form.elements[`imageFile_${imageName}`];
    const preview = field.querySelector("[data-record-image-preview]");
    const updateImagePreview = () => {
      const file = fileInput.files[0];
      if (file) return;

      const enteredImageUrl = imagePreviewUrl(urlInput.value.trim());
      if (enteredImageUrl) {
        setImagePreview(preview, enteredImageUrl, "AperÃ§u de lâ€™URL");
        return;
      }

      const currentImageUrl = imagePreviewUrl(field.dataset.currentImage || "");
      setImagePreview(
        preview, currentImageUrl, currentImageUrl ? "Image actuelle" : "",
      );
    };

    urlInput.addEventListener("input", updateImagePreview);
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) {
        updateImagePreview();
        return;
      }
      try {
        validateImageFile(file);
        setImagePreview(preview, URL.createObjectURL(file), file.name);
      } catch (error) {
        fileInput.value = "";
        updateImagePreview();
        showNotice(friendlyError(error));
      }
    });
  }
}

for (const form of [
  $("#home-content-form"),
  $("#about-content-form"),
]) {
  for (const field of form.querySelectorAll("[data-content-image]")) {
    const preview = field.querySelector("[data-content-preview]");
    const urlInput = field.querySelector('input[type="url"]');
    const fileInput = field.querySelector('input[type="file"]');
    urlInput.addEventListener("input", () => {
      if (fileInput.files[0]) return;
      const enteredUrl = imagePreviewUrl(urlInput.value.trim());
      if (enteredUrl) {
        setContentImagePreview(preview, enteredUrl, "AperÃ§u de lâ€™URL");
      } else {
        setContentImagePreview(
          preview,
          field.dataset.currentImage,
          field.dataset.currentImage
            ? `Image actuelle : ${field.dataset.currentImage}` : "",
        );
      }
    });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) {
        urlInput.dispatchEvent(new Event("input"));
        return;
      }
      try {
        validateImageFile(file);
        setContentImagePreview(
          preview, URL.createObjectURL(file), file.name,
        );
      } catch (error) {
        fileInput.value = "";
        showNotice(friendlyError(error));
      }
    });
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action], [data-cancel], .tab");
  if (!target) return;
  if (target.matches(".tab")) {
    document.querySelectorAll(".tab").forEach((tab) =>
      tab.classList.toggle("active", tab === target));
    document.querySelectorAll(".management-panel").forEach((panel) =>
      panel.classList.toggle("hidden", panel.id !== target.dataset.panel));
  } else if (target.dataset.cancel) {
    resetForm(target.dataset.cancel === "product" ? productForm : publicationForm);
  } else if (target.dataset.action === "edit") {
    editRecord(target.dataset.type, target.dataset.id);
  } else if (target.dataset.action === "delete") {
    await deleteRecord(target.dataset.type, target.dataset.id);
  }
});

onAuthStateChanged(auth, async (user) => {
  stopListeners();
  if (!user) {
    setSignedIn(false);
    $("#admin-email").textContent = "";
    return;
  }
  try {
    if (user.uid !== dashboardAdminUid) {
      await signOut(auth);
      showNotice("Ce compte Firebase n'est pas autorisé pour le tableau de bord.");
      return;
    }
    $("#admin-email").textContent = user.email || "";
    setSignedIn(true);
    watchRecords();
  } catch (error) {
    showNotice(friendlyError(error));
  }
});
