# RESTO WEB — site web et tableau de bord

Site vitrine responsive et espace d’administration Firebase pour Laur & Dor Gourmet. La vitrine et l’application Android RESTO utilisent le projet Firebase `resto-95dfd`.

## Prévisualiser le site

Depuis ce dossier, lancez un petit serveur local :

```powershell
python -m http.server 8000
```

Ouvrez ensuite `http://localhost:8000/` pour le site ou `http://localhost:8000/dashboard.html` pour le tableau de bord. Le navigateur doit être connecté à Internet pour charger les modules Firebase.

## Utiliser le tableau de bord

1. Activez la méthode **E-mail/Mot de passe** dans Firebase Authentication et utilisez le compte administrateur autorisé pour le projet.
2. Ouvrez `dashboard.html` et connectez-vous. Seul l’UID administrateur prévu par les règles Firestore peut modifier les données.
3. Gérez les produits, les actualités, les textes du site et les liens depuis les panneaux.

Les données sont enregistrées dans les collections Firestore `produits`, `publications` et `contenu`. Le site vitrine lit ces données en temps réel. Les images choisies depuis un ordinateur sont envoyées vers le preset Cloudinary déjà utilisé par le projet ; vous pouvez aussi saisir directement une URL HTTPS. Dans **Contenu du site → À propos & contact**, modifiez **Numéro WhatsApp principal** pour mettre à jour les liens « Nous contacter » et « Parlons ensemble ». Le numéro de commande reste modifiable produit par produit ; le numéro principal est proposé par défaut lors de l’ajout d’un produit. Les actualités peuvent contenir jusqu’à trois images, qui défilent automatiquement toutes les cinq secondes.

## Installation sur téléphone et notifications

Le manifeste `manifest.webmanifest`, les icônes et le service worker FCM rendent le site installable et permettent de demander l’autorisation des notifications. Le visiteur choisit lui-même d’installer le site et d’autoriser les notifications ; elles ne sont jamais demandées automatiquement. Le service worker gère les notifications, mais ne met pas les pages ni les ressources en cache : une connexion Internet reste nécessaire pour ouvrir le site. L’identifiant PWA (`id`), l’URL de démarrage et la portée du manifeste restent fixés à la racine du site pour conserver une identité d’installation unique. Utilisez toujours `https://laur-dor.web.app` pour installer le site : dans le navigateur, l’alias `laur-dor.firebaseapp.com` redirige vers cette adresse. Une PWA déjà lancée depuis l’alias reste sur sa propre origine pour pouvoir s’ouvrir correctement. Ces deux domaines sont deux origines différentes et peuvent créer deux icônes distinctes. Le bouton d’installation n’apparaît que si le navigateur propose son invite d’installation (ou sur iOS, où l’installation se fait depuis Safari). Le site ne propose pas de raccourci manuel Android lorsqu’aucune invite n’est disponible. Il ne peut pas supprimer une icône déjà installée ; supprimez manuellement les icônes existantes puis réinstallez depuis l’adresse canonique pour repartir sur une seule installation.

L’application Web, sa clé publique Web Push et l’UID administrateur sont déjà configurés dans `firebase-config.js`. Activez Firebase Cloud Messaging API v1 dans le projet `resto-95dfd`, puis déployez le site sur Firebase Hosting. Depuis un téléphone, utilisez **Ajouter l’icône** quand le navigateur affiche l’invite d’installation, puis **Activer les notifications**. Sur iPhone/iPad, ajoutez d’abord le site à l’écran d’accueil via Safari. Quand l’installation et l’inscription aux notifications sont confirmées, leur état est indiqué par une coche verte.

Le service worker affiche les notifications reçues en arrière-plan, qu’elles contiennent un bloc `notification` ou seulement des données, avec l’icône RESTO WEB. Si le site est ouvert au premier plan, son module traite aussi le message et affiche la même icône. Le site obtient un jeton FCM sur l’appareil, mais ne l’affiche pas et ne l’enregistre pas sur un serveur. Il n’existe donc pas encore de liste de destinataires que le site puisse cibler pour une diffusion générale. Pour tester un appareil depuis Firebase Console, il faut disposer de son jeton FCM et le saisir dans **Envoyer un message de test**. Pour gérer des abonnés ou automatiser une diffusion ciblée, ajoutez un stockage sécurisé des jetons et un service d’envoi ; ne placez jamais de credentials d’envoi dans le navigateur. Les campagnes ciblant des audiences nécessitent également une configuration Analytics/audience compatible.

Un envoi de test depuis Firebase Console à un jeton FCM connu ne demande pas de serveur personnalisé. Une campagne sans serveur n’est possible que si le projet dispose d’une audience Analytics compatible. Pour envoyer à tous les appareils inscrits sans cette configuration, ou gérer les abonnements, il faut ajouter un stockage sécurisé des jetons et un service d’envoi.

La configuration Firebase du navigateur est publique par conception. Les accès en écriture doivent rester protégés par les règles Firestore du projet ; ne placez jamais de clé de compte de service dans ce dossier.

## Déployer sur Firebase Hosting sans remplacer l’ancien site

`firebase.json` cible un site Hosting distinct nommé `laur-dor`, afin de ne pas écraser le site Hosting déjà configuré à la racine du dépôt.

1. Installez Firebase CLI si nécessaire : `npm install -g firebase-tools`.
2. Depuis ce dossier, connectez-vous avec `firebase login`.
3. Créez le site Hosting dédié une seule fois :

   ```powershell
   firebase hosting:sites:create laur-dor --project resto-95dfd
   ```

4. Déployez ce dossier :

   ```powershell
   firebase deploy --only hosting --project resto-95dfd
   ```

Les identifiants de sites Firebase Hosting doivent être uniques. Si `laur-dor` est déjà pris par un autre projet, choisissez un autre identifiant, puis utilisez-le dans la commande de création et dans la propriété `hosting.site` de `firebase.json`.

Pour attribuer un domaine personnalisé, utilisez **Hosting → Ajouter un domaine personnalisé** dans la console Firebase du site `laur-dor`.
