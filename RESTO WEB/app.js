import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, firebaseVapidKey } from "./firebase-config.js";

const SHOP = {
  whatsapp: "22899057931",
  products: [],
  news: [],
};
const DEFAULT_CONTENT = {
  accueil: {
    accueil_titre: "La cuisine qui\nrassemble.",
    accueil_description: "Bienvenue chez Laur & Dor Gourmet. Découvrez la carte et les actualités de notre restaurant.",
    accueil_bouton_produits: "Découvrir la carte",
    accueil_bouton_infos: "Nos actualités",
  },
  apropos: {
    infos_titre: "Infos & actualités",
    apropos_titre: "Bienvenue chez\nLaur & Dor Gourmet.",
    apropos_description: "Un restaurant où découvrir une cuisine généreuse et partager un bon moment.",
    apropos_lien_texte: "SITE OFFICIEL",
    apropos_lien_url: "",
    apropos_contact_texte: "CONTACT",
    apropos_contact_url: "",
    telephone_contact: "22899057931",
    photo: "",
  },
};

const pageButtons = document.querySelectorAll("[data-page]");
const pageLinks = document.querySelectorAll("[data-page-link]");
const pages = document.querySelectorAll(".page-view");
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const searchInput = document.querySelector("[data-product-search]");
const firebaseStatus = document.querySelector("[data-firebase-status]");
const firebaseErrors = new Map();
const appStatus = document.querySelector("[data-app-status]");
const installButton = document.querySelector("[data-install-app]");
const installedBadge = document.querySelector("[data-installed-badge]");
const notificationButton = document.querySelector("[data-enable-notifications]");
const notificationsReadyBadge = document.querySelector("[data-notifications-ready]");
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
let deferredInstallPrompt;
let notificationsRegistered = false;
let foregroundMessageHandlerRegistered = false;
let serviceWorkerRegistrationPromise;
const carouselIntervals = {
  products: new Set(),
  news: new Set(),
};
const defaultHomeImages = [
  "/assets/logo.png",
  "/assets/logo1.png",
  "/assets/logo2.png",
  "/assets/logo3.png",
];
let homeImages = [];
let homeImageIndex = 0;
let homeImageInterval;
const installDisplayMode = window.matchMedia("(display-mode: standalone)");
let installationConfirmed = installDisplayMode.matches || navigator.standalone === true;

function whatsappUrl(message) {
  return `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(message)}`;
}

function setWhatsappLinks() {
  document.querySelectorAll("[data-whatsapp]").forEach((link) => {
    link.href = whatsappUrl("Bonjour Laur & Dor Gourmet, je souhaite avoir des informations.");
  });
}

function showFirebaseError(source, error) {
  firebaseErrors.set(source, error.message || "Erreur de connexion Firebase.");
  firebaseStatus.textContent = `Impossible de charger toutes les données : ${[...firebaseErrors.values()].join(" ")}`;
  firebaseStatus.hidden = false;
}

function setAppStatus(message, kind = "info") {
  appStatus.textContent = message;
  appStatus.dataset.kind = kind;
  appStatus.hidden = false;
}

function safeNotificationUrl(value) {
  const defaultUrl = new URL("/#infos", window.location.origin).href;
  try {
    const url = new URL(value || defaultUrl, window.location.origin);
    return url.origin === window.location.origin ? url.href : defaultUrl;
  } catch {
    return defaultUrl;
  }
}

function updateNotificationButton() {
  if (!("Notification" in window)) {
    notificationButton.hidden = true;
    notificationsReadyBadge.hidden = true;
    return;
  }
  const ready = Notification.permission === "granted" && notificationsRegistered;
  notificationsReadyBadge.hidden = !ready;
  notificationButton.hidden = ready;
  notificationButton.classList.toggle("is-enabled", ready);
  if (Notification.permission === "granted") {
    notificationButton.textContent = "Réessayer les notifications";
    notificationButton.disabled = false;
  } else if (Notification.permission === "denied") {
    notificationButton.textContent = "Notifications bloquées dans les réglages";
    notificationButton.disabled = true;
  } else {
    notificationButton.textContent = "Activer les notifications";
    notificationButton.disabled = false;
  }
}

async function getServiceWorkerRegistration() {
  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker.register(
      new URL("./firebase-messaging-sw.js", window.location.href),
      { scope: "./" },
    ).catch((error) => {
      serviceWorkerRegistrationPromise = undefined;
      throw error;
    });
  }
  const registration = await serviceWorkerRegistrationPromise;
  await navigator.serviceWorker.ready;
  return registration;
}

function updateInstallState() {
  const isStandalone = installDisplayMode.matches || navigator.standalone === true;
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  installationConfirmed = installationConfirmed || isStandalone;
  installedBadge.hidden = !installationConfirmed;
  installButton.hidden = installationConfirmed || (!deferredInstallPrompt && !isAppleMobile);
}

async function enableNotifications() {
  if (!window.isSecureContext) {
    setAppStatus("Les notifications nécessitent une adresse HTTPS. Déployez le site sur Firebase Hosting pour les activer.", "error");
    return;
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    setAppStatus("Ce navigateur ne prend pas en charge les notifications web.", "error");
    return;
  }

  if (Notification.permission === "granted") {
    notificationButton.disabled = true;
    try {
      await registerForPushNotifications();
    } catch (error) {
      setAppStatus(`Activation impossible : ${error.message || "erreur Firebase inconnue."}`, "error");
      notificationButton.disabled = false;
    }
    return;
  }

  notificationButton.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    updateNotificationButton();
    if (permission !== "granted") {
      if (permission === "denied") {
        setAppStatus("Les notifications sont bloquées dans les réglages du navigateur. Autorisez-les pour ce site, puis réessayez.", "error");
      } else {
        setAppStatus("Vous pourrez activer les notifications quand vous le souhaitez.", "info");
        notificationButton.disabled = false;
      }
      return;
    }

    await registerForPushNotifications();
  } catch (error) {
    setAppStatus(`Activation impossible : ${error.message || "erreur Firebase inconnue."}`, "error");
    notificationButton.disabled = false;
  }
}

async function registerForPushNotifications() {
  const [{ getMessaging, getToken, isSupported, onMessage }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js"),
  ]);
  if (!(await isSupported())) {
    setAppStatus("Firebase Cloud Messaging n’est pas pris en charge dans ce navigateur.", "error");
    notificationButton.disabled = false;
    return;
  }
  const registration = await getServiceWorkerRegistration();
  const token = await getToken(getMessaging(firebaseApp), {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Firebase n’a pas pu créer l’abonnement de notification.");
  if (!foregroundMessageHandlerRegistered) {
    onMessage(getMessaging(firebaseApp), (payload) => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      const requestedUrl = (payload.fcmOptions && payload.fcmOptions.link) || data.url || "/#infos";
      const safeUrl = safeNotificationUrl(requestedUrl);

      if (Notification.permission === "granted") {
        registration.showNotification(
          notification.title || data.title || "RESTO",
          {
            body: notification.body || data.body || "Une nouvelle actualité vous attend.",
            icon: "/assets/resto-icon-192.png",
            data: { url: safeUrl },
          },
        ).catch((error) => {
          setAppStatus(`Message reçu, mais la notification n’a pas pu s’afficher : ${error.message}`, "error");
        });
      }
    });
    foregroundMessageHandlerRegistered = true;
  }

  notificationsRegistered = true;
  updateNotificationButton();
}

function installInstructions() {
  setAppStatus("Sur iPhone/iPad : touchez Partager dans Safari, puis « Sur l’écran d’accueil ».", "info");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallState();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = undefined;
  installationConfirmed = true;
  updateInstallState();
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    installInstructions();
    return;
  }
  const installPrompt = deferredInstallPrompt;
  deferredInstallPrompt = undefined;
  updateInstallState();
  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      installationConfirmed = true;
      updateInstallState();
    }
  } catch (error) {
    setAppStatus(`Installation impossible : ${error.message || "réessayez depuis votre navigateur."}`, "error");
    updateInstallState();
  }
});

notificationButton.addEventListener("click", enableNotifications);
updateNotificationButton();
updateInstallState();
installDisplayMode.addEventListener("change", updateInstallState);
if ("Notification" in window && Notification.permission === "granted") {
  registerForPushNotifications().catch((error) => {
    setAppStatus(`Initialisation des notifications impossible : ${error.message || "erreur Firebase inconnue."}`, "error");
    notificationButton.disabled = false;
    notificationButton.textContent = "Réessayer l’inscription";
  });
}
if ("serviceWorker" in navigator) {
  getServiceWorkerRegistration().catch((error) => {
    setAppStatus(`Le service de notifications n’a pas pu être préparé : ${error.message}`, "error");
  });
}

function clearFirebaseError(source) {
  firebaseErrors.delete(source);
  firebaseStatus.textContent = [...firebaseErrors.values()].join(" ");
  firebaseStatus.hidden = firebaseErrors.size === 0;
}

function setStyledTitle(element, value) {
  const [firstLine, ...remainingLines] = String(value || "").split(/\r?\n/);
  element.replaceChildren(document.createTextNode(firstLine || ""));
  if (remainingLines.length) {
    element.append(document.createElement("br"));
    const emphasis = document.createElement("em");
    emphasis.textContent = remainingLines.join(" ");
    element.append(emphasis);
  }
}

function renderHomeContent(content = {}) {
  const values = { ...DEFAULT_CONTENT.accueil, ...content };
  setStyledTitle(document.querySelector("[data-home-title]"), values.accueil_titre);
  document.querySelector("[data-home-description]").textContent = values.accueil_description;
  document.querySelector("[data-home-products]").textContent = values.accueil_bouton_produits;
  document.querySelector("[data-home-news]").textContent = values.accueil_bouton_infos;
  renderHomeLogoCarousel(values);
}

function renderHomeLogoCarousel(content) {
  const images = [
    "/assets/resto-icon.png",
    ...[1, 2, 3, 4].map((index) =>
      safeCarouselImage(content[`logo_${index}`]) || defaultHomeImages[index - 1],
    ),
  ];
  homeImages = [...new Set(images)];
  showHomeLogo(0);
  window.clearInterval(homeImageInterval);
  homeImageInterval = window.setInterval(() => {
    showHomeLogo(homeImageIndex + 1);
  }, 4200);
}

function showHomeLogo(index) {
  const image = document.querySelector("[data-home-logo]");
  if (!homeImages.length || !image) return;
  homeImageIndex = (index + homeImages.length) % homeImages.length;
  image.classList.remove("is-active");
  image.src = homeImages[homeImageIndex];
  image.alt = homeImageIndex === 0
    ? "Logo LAUR&DOR Gourmet"
    : `Image ${homeImageIndex} du carrousel LAUR&DOR`;
  requestAnimationFrame(() => image.classList.add("is-active"));
  document.querySelector("[data-logo-current]").textContent =
    String(homeImageIndex + 1).padStart(2, "0");
  document.querySelector("[data-logo-total]").textContent =
    String(homeImages.length).padStart(2, "0");
}

function renderAboutContent(content = {}) {
  const values = { ...DEFAULT_CONTENT.apropos, ...content };
  const contactPhone = String(values.telephone_contact || "").replace(/\D/g, "");
  if (contactPhone.length >= 8 && contactPhone.length <= 15) {
    SHOP.whatsapp = contactPhone;
    setWhatsappLinks();
  }
  document.querySelector("[data-news-title]").textContent = values.infos_titre;
  setStyledTitle(document.querySelector("[data-about-title]"), values.apropos_titre);
  document.querySelector("[data-about-description]").textContent = values.apropos_description;

  const photo = document.querySelector("[data-about-photo]");
  const placeholder = document.querySelector(".photo-placeholder");
  const photoUrl = safeImageUrl(values.photo);
  photo.hidden = !photoUrl;
  placeholder.hidden = Boolean(photoUrl);
  if (photoUrl) photo.src = photoUrl;
  else photo.removeAttribute("src");

  setExternalLink(
    document.querySelector("[data-about-site]"),
    values.apropos_lien_texte,
    values.apropos_lien_url,
  );
  setExternalLink(
    document.querySelector("[data-about-contact]"),
    values.apropos_contact_texte,
    values.apropos_contact_url,
  );
}

function safeImageUrl(value = "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function safeCarouselImage(value = "") {
  const remoteUrl = safeImageUrl(value);
  if (remoteUrl) return remoteUrl;
  const localAsset = String(value).match(/^(?:\/assets\/|images\/)([\w.-]+)$/i);
  return localAsset ? `/assets/${localAsset[1]}` : "";
}

function setExternalLink(link, text, destination) {
  const safeUrl = safeImageUrl(destination);
  link.hidden = !safeUrl;
  if (safeUrl) {
    link.href = safeUrl;
    link.textContent = text || "En savoir plus";
  } else {
    link.removeAttribute("href");
  }
}

function showPage(name, updateLocation = true) {
  const page = document.querySelector(`#page-${name}`);
  if (!page) return;

  pages.forEach((item) => {
    const active = item === page;
    item.hidden = !active;
    item.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-page], [data-page-link]").forEach((button) => {
    const active = button.dataset.page === name || button.dataset.pageLink === name;
    button.classList.toggle("active", button.dataset.page !== undefined && active);
    if (button.dataset.page !== undefined) button.setAttribute("aria-current", active ? "page" : "false");
  });
  mainNav.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  if (updateLocation && window.location.hash !== `#${name}`) {
    window.history.replaceState(null, "", `#${name}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function emptyState(title, message) {
  const state = document.createElement("div");
  state.className = "empty-state";
  const mark = document.createElement("span");
  mark.className = "empty-state-mark";
  mark.textContent = "✧";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const description = document.createElement("p");
  description.textContent = message;
  state.append(mark, heading, description);
  return state;
}

function createImageCarousel(images, label, visualClass, imageClass, intervals) {
  const visual = document.createElement("div");
  visual.className = visualClass;
  const carouselImages = images.map((imageUrl, index) => {
    const image = document.createElement("img");
    image.className = `${imageClass}${index === 0 ? " active" : ""}`;
    image.src = imageUrl;
    image.alt = `${label} — photo ${index + 1} sur ${images.length}`;
    image.loading = index === 0 ? "eager" : "lazy";
    visual.append(image);
    return image;
  });

  if (carouselImages.length < 2) return visual;

  let activeIndex = 0;
  const dots = [];
  const showImage = (index) => {
    activeIndex = (index + carouselImages.length) % carouselImages.length;
    carouselImages.forEach((image, imageIndex) => {
      image.classList.toggle("active", imageIndex === activeIndex);
    });
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeIndex;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", String(active));
    });
  };
  const addControl = (direction, ariaLabel, symbol) => {
    const control = document.createElement("button");
    control.className = `carousel-control ${direction}`;
    control.type = "button";
    control.setAttribute("aria-label", ariaLabel);
    control.textContent = symbol;
    control.addEventListener("click", () => {
      showImage(activeIndex + (direction === "next" ? 1 : -1));
    });
    visual.append(control);
  };
  addControl("previous", `Photo précédente de ${label}`, "‹");
  addControl("next", `Photo suivante de ${label}`, "›");

  const indicators = document.createElement("div");
  indicators.className = "carousel-dots";
  indicators.setAttribute("aria-label", `Photos de ${label}`);
  images.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.className = `carousel-dot${index === 0 ? " active" : ""}`;
    dot.type = "button";
    dot.setAttribute("aria-label", `Afficher la photo ${index + 1} de ${label}`);
    dot.setAttribute("aria-current", String(index === 0));
    dot.addEventListener("click", () => showImage(index));
    dots.push(dot);
    indicators.append(dot);
  });
  visual.append(indicators);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    intervals.add(window.setInterval(() => showImage(activeIndex + 1), 5000));
  }
  return visual;
}

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const images = product.images || [product.image, product.image_2, product.image_3].filter(Boolean);
  if (images.length) {
    card.append(createImageCarousel(
      images,
      product.name,
      "product-visual",
      "product-carousel-image",
      carouselIntervals.products,
    ));
  } else {
    const visual = document.createElement("div");
    visual.className = "product-visual";
    const placeholder = document.createElement("span");
    placeholder.className = "product-placeholder";
    placeholder.textContent = "D";
    placeholder.setAttribute("aria-label", "Image produit à ajouter");
    visual.append(placeholder);
    card.append(visual);
  }

  const info = document.createElement("div");
  info.className = "product-info";
  const category = document.createElement("p");
  category.className = "product-category";
  category.textContent = product.category || "Restaurant";
  const name = document.createElement("h3");
  name.textContent = product.name;
  const description = document.createElement("p");
  description.textContent = product.description || "";
  const bottom = document.createElement("div");
  bottom.className = "product-bottom";
  const price = document.createElement("span");
  price.className = "product-price";
  price.textContent = product.price || "";
  const order = document.createElement("a");
  order.className = "order-link";
  const orderPhone = String(product.phone || SHOP.whatsapp).replace(/\D/g, "") || SHOP.whatsapp;
  order.href = `https://wa.me/${orderPhone}?text=${encodeURIComponent(`Bonjour Laur & Dor Gourmet, je souhaite commander : ${product.name}.`)}`;
  order.target = "_blank";
  order.rel = "noopener noreferrer";
  order.textContent = "Commander ↗";
  bottom.append(price, order);
  info.append(category, name, description, bottom);
  card.append(info);
  return card;
}

function renderProducts(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const products = SHOP.products.filter((product) =>
    `${product.name} ${product.category || ""} ${product.description || ""}`
      .toLocaleLowerCase("fr")
      .includes(normalizedQuery),
  );

  carouselIntervals.products.forEach((interval) => window.clearInterval(interval));
  carouselIntervals.products.clear();
  document.querySelectorAll("[data-product-list]").forEach((list) => {
    list.replaceChildren();
    const visibleProducts = list.dataset.productList === "home"
      ? SHOP.products.slice(0, 3)
      : products;
    if (visibleProducts.length) {
      visibleProducts.forEach((product) => list.append(createProductCard(product)));
    } else {
      const hasProducts = list.dataset.productList !== "home" && SHOP.products.length > 0;
      list.append(emptyState(
        hasProducts ? "Aucun résultat" : "La sélection arrive bientôt",
        hasProducts
          ? "Essayez une autre recherche pour trouver votre produit."
          : "La carte sera bientôt disponible. Contactez-nous pour en savoir plus.",
      ));
    }
  });

  const count = document.querySelector("[data-product-count]");
  if (count) count.textContent = `${products.length} produit${products.length === 1 ? "" : "s"}`;
}

function renderNews() {
  const list = document.querySelector("[data-news-list]");
  carouselIntervals.news.forEach((interval) => window.clearInterval(interval));
  carouselIntervals.news.clear();
  list.replaceChildren();
  if (!SHOP.news.length) {
    list.append(emptyState("Restez connectés", "Nos actualités seront bientôt publiées ici."));
    return;
  }

  SHOP.news.forEach((item) => {
    const card = document.createElement("article");
    card.className = "news-card";
    const images = item.images || [item.image].filter(Boolean);
    if (images.length) {
      card.append(createImageCarousel(
        images,
        item.title,
        "news-visual",
        "news-carousel-image",
        carouselIntervals.news,
      ));
    }
    const date = document.createElement("span");
    date.className = "news-date";
    date.textContent = item.date || "RESTO";
    const title = document.createElement("h2");
    title.textContent = item.title;
    const content = document.createElement("p");
    content.textContent = item.content || "";
    card.append(date, title, content);
    list.append(card);
  });
}

pageButtons.forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
pageLinks.forEach((link) => link.addEventListener("click", () => showPage(link.dataset.pageLink)));
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});
menuToggle.addEventListener("click", () => {
  const open = mainNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});
searchInput.addEventListener("input", () => renderProducts(searchInput.value));
document.querySelectorAll("[data-logo-step]").forEach((button) => {
  button.addEventListener("click", () => {
    showHomeLogo(homeImageIndex + Number(button.dataset.logoStep));
    window.clearInterval(homeImageInterval);
    homeImageInterval = window.setInterval(() => {
      showHomeLogo(homeImageIndex + 1);
    }, 4200);
  });
});
document.querySelector("[data-year]").textContent = new Date().getFullYear();

setWhatsappLinks();
renderProducts();
renderNews();
renderHomeContent();
renderAboutContent();

const initialPage = window.location.hash.slice(1);
if (["accueil", "produits", "infos", "apropos"].includes(initialPage)) {
  showPage(initialPage, false);
}

onSnapshot(
  collection(db, "produits"),
  (snapshot) => {
    SHOP.products = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        name: data.nom || "Produit",
        category: data.categorie || data.category || "Restaurant",
        description: data.description || "",
        price: data.prix || "",
        images: [data.image, data.image_2, data.image_3]
          .map((image) => safeImageUrl(image))
          .filter(Boolean),
        phone: data.telephone_commande || SHOP.whatsapp,
      };
    });
    clearFirebaseError("produits");
    renderProducts(searchInput.value);
  },
  (error) => showFirebaseError("produits", error),
);

onSnapshot(
  collection(db, "publications"),
  (snapshot) => {
    SHOP.news = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        title: data.titre || "Actualité LAUR&DOR",
        content: data.contenu || "",
        date: data.date || "",
        images: [data.image, data.image_2, data.image_3]
          .map((image) => safeImageUrl(image))
          .filter(Boolean),
      };
    });
    clearFirebaseError("publications");
    renderNews();
  },
  (error) => showFirebaseError("publications", error),
);

onSnapshot(
  doc(db, "contenu", "accueil"),
  (snapshot) => {
    renderHomeContent(snapshot.exists() ? snapshot.data() : {});
    clearFirebaseError("accueil");
  },
  (error) => showFirebaseError("accueil", error),
);

onSnapshot(
  doc(db, "contenu", "apropos"),
  (snapshot) => {
    renderAboutContent(snapshot.exists() ? snapshot.data() : {});
    clearFirebaseError("apropos");
  },
  (error) => showFirebaseError("apropos", error),
);
