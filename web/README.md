# RESTO — tableau de bord administrateur

Le tableau de bord utilise Firebase Authentication et Firestore du projet
`resto-95dfd`. Il n'initialise pas Firebase Storage et n'inclut aucun mot de
passe ni credential de compte de service.

## Préparation Firebase

1. Dans Firebase Console, activer le fournisseur **E-mail/Mot de passe** dans
   Authentication et vérifier que le compte administrateur RESTO peut se connecter.
2. La configuration Firebase est définie dans `web/firebase-config.js` pour le
   projet RESTO. La clé API Firebase de configuration est publique ; elle ne doit
   pas être confondue avec un credential de compte de service.
3. Le compte autorisé est celui dont l'UID est `mvDhKiXSv7duDfp5ch2UxNO2kBp1`.
  Cette valeur est déjà configurée dans `web/firebase-config.js` et
  `firestore.rules`. Les règles Firestore limitent les écritures à cet UID.

## Déployer

Avec Firebase CLI déjà authentifié :

```sh
firebase deploy --only hosting,firestore:rules
```

Héberger le tableau de bord en HTTPS via Firebase Hosting et publier les règles
Firestore mises à jour. Ne pas l'ouvrir directement depuis `file://` : les
modules Firebase exigent un serveur Web.

## Compiler l'APK

L'identifiant Android est `com.resto.app` (`package.domain` + `package.name`
dans `buildozer.spec`). Buildozer est configuré pour produire une APK. La
compilation et le téléchargement de l'APK seront lancés manuellement depuis
GitHub, comme prévu ; ne changez pas l'identifiant du package pour les builds
suivants.

Les lectures des collections `produits`, `publications` et `contenu` sont
publiques pour les appareils clients. Seul l'UID configuré peut écrire dans
Firestore. Le tableau de bord conserve les contenus fixes
dans `contenu/accueil` (textes et quatre logos) et `contenu/apropos` (titre des
actualités, textes de la page « À propos », photo et liens du site et CONTACT).
Les documents `produits` et `publications` peuvent stocker jusqu'à trois images
dans `image`, `image_2` et `image_3`. Les images renseignées défilent dans
l'application toutes les cinq secondes ; les emplacements vides sont ignorés.
Les valeurs initiales reproduisent celles de l'application ; les images locales
existantes sont conservées tant qu'elles ne sont pas remplacées. L'application
Android lit ces documents au démarrage et garde son contenu local si aucun
document n'a encore été créé. Cette lecture à distance nécessite d'abord de publier une nouvelle
version Android contenant cette fonctionnalité ; ensuite, modifier ces champs
ne nécessite pas une nouvelle publication Android. Le compte admin doit se
connecter avec l'UID configuré dans le tableau de bord. Le document
`contenu/apropos` contient aussi `apropos_lien_url`,
destination HTTPS du lien `apropos_lien_texte`; l'application l'ouvre depuis la
page « À propos ». Sa valeur par défaut est `https://laur-dor.web.app`. Le
lien CONTACT est défini par `apropos_contact_texte` et
`apropos_contact_url`; son URL HTTPS peut être modifiée dans « Accueil et infos ».

Chaque document de `produits` peut définir `telephone_commande`, le numéro
WhatsApp international à utiliser pour le bouton « Commander » de ce produit.
Le tableau de bord permet de le saisir et de le modifier produit par produit.
Les anciens produits sans ce champ continuent d’utiliser le numéro historique
`22899057931` jusqu’à leur modification.

## Hébergement d'images

Le tableau de bord téléverse directement les images vers Cloudinary avec le
cloud `jvljzrue` et le preset non signé `vente_images` (configuration Cloudinary
existante, indépendante du projet Firebase RESTO). Aucune clé secrète ni
Firebase Storage n'est utilisé. Firestore conserve l'URL HTTPS `secure_url`
renvoyée par Cloudinary dans le champ `image` des collections `produits` et
`publications` et dans les champs d'image de `contenu/accueil` et
`contenu/apropos`. Une URL HTTPS saisie manuellement reste possible pour
préserver le flux précédent. Lors d'une modification, ne pas choisir de fichier
ni saisir d'URL conserve la référence actuelle, y compris les références locales
historiques.

Les fichiers sont limités à JPEG, PNG ou WebP et à 5 Mo pour rester compatibles
avec le client Android, qui lit les images HTTPS selon leur type MIME et les met
en cache localement. Les chemins historiques tels que `images/produit1.jpg` ne
sont pas réécrits et les fichiers locaux ne doivent pas être supprimés : ils
restent nécessaires aux références locales de l'APK.

Un preset non signé et son cloud name sont visibles dans le code du navigateur
et l'endpoint Cloudinary ne vérifie pas la connexion Firebase : toute personne
qui connaît ces paramètres peut tenter un téléversement. Restreindre le preset
dans Cloudinary aux formats image attendus et à la taille maximale autorisée,
désactiver l'écrasement si possible et surveiller les quotas. Ne jamais ajouter
de secret Cloudinary au client. Ne pas activer Firebase Storage, modifier la
facturation ni déployer `storage.rules`.

Le tableau de bord met à jour `metadata/dashboard` après chaque création,
modification ou suppression de produit/publication et après chaque
enregistrement de contenu. Ce document sert uniquement d'indicateur de
changement. Au retour de l'application Android au premier plan, celle-ci le
compare à la dernière version connue et ne recharge ses onglets que s'il a
changé et si Android confirme une connexion Internet. Sans connexion, ou si
rien n'a changé, les onglets et les données affichées restent intacts. Android
pouvant suspendre l'application, la vérification se fait à son retour, pas
pendant cette suspension.

La lecture publique et l'écriture admin de `metadata` sont définies dans
`firestore.rules`. Déployer les règles avec Firebase CLI après leur modification
(`firebase deploy --only firestore:rules`) et publier la nouvelle version du
tableau de bord. Reconstruire et installer l'application Android pour activer
la vérification conditionnelle.

## Vérification

- Connexion avec l'administrateur : affichage des produits, publications et
  des textes actuels de l'accueil et de la page « À propos ».
- Application Android hors connexion lors de sa reprise : aucune requête
  d'actualisation ; rétablir Internet puis revenir dans l'application.
- Application avec Internet : reprendre sans modification du tableau de bord
  (les onglets ne sont pas rechargés), puis modifier un contenu et reprendre à
  nouveau (les onglets sont rechargés).
- Modification des textes et des images de l'accueil/infos ; vérification de
  leur affichage dans l'application Android après redémarrage.
- Enregistrement d'une, deux puis trois images pour un produit et une
  publication ; vérifier que seules les images disponibles défilent toutes les
  cinq secondes.
- Modification du texte et de l'URL HTTPS CONTACT ; vérifier l'ouverture de
  l'adresse configurée depuis l'onglet « À propos ».
- Création, modification et suppression de chaque type dans Firestore.
- Modification du numéro de commande de produits différents et vérification
  que chaque bouton « Commander » ouvre le bon numéro WhatsApp.
- Téléversement Cloudinary d'une image JPEG, PNG ou WebP et enregistrement de
  son URL HTTPS dans Firestore.
- Conservation de l'image existante si aucun nouveau fichier n'est sélectionné.
- Connexion d'un autre compte Firebase : aucune écriture autorisée.
- Affichage des URL d'images sur l'application Android et un second appareil.
- Publication Android via une piste de test interne Google Play.
- Ne pas déployer les règles Storage ni modifier le forfait Firebase pour
  cette solution.
