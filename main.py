import re
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, urlparse

from kivy.animation import Animation
from kivy.clock import Clock
from kivy.lang import Builder
from kivy.properties import (
    BooleanProperty,
    ListProperty,
    NumericProperty,
    StringProperty,
)
from kivy.graphics import Color, Rectangle
from kivy.graphics.texture import Texture
from kivy.logger import Logger
from kivy.metrics import dp
from kivymd.app import MDApp
from kivymd.uix.navigationbar import (
    MDNavigationBar,
    MDNavigationItem,
    MDNavigationItemIcon,
    MDNavigationItemLabel,
)

from database import (
    FirebaseError,
    image_locale,
    obtenir_contenu_application,
    obtenir_produits,
    obtenir_publications,
    obtenir_revision_tableau,
)

from kivy.uix.popup import Popup
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.image import Image
from kivy.uix.label import Label as KivyLabel

try:
    from android import activity
    from android.permissions import check_permission, request_permissions
except ImportError:
    activity = None
    check_permission = None
    request_permissions = None


ANDROID_NOTIFICATION_PERMISSION = "android.permission.POST_NOTIFICATIONS"


class BaseNavigationItem(MDNavigationItem):
    icon = StringProperty()
    text = StringProperty()
    screen_name = StringProperty()


class AnimatedLogo(BoxLayout):
    scale = NumericProperty(1)


class ImageCarousel(Image):
    sources = ListProperty([])

    def __init__(self, **kwargs):
        self._slide_event = None
        self._slide_index = 0
        super().__init__(**kwargs)
        self.bind(parent=self._on_parent, sources=self._on_sources)
        self._on_sources(self, self.sources)

    def _on_parent(self, _instance, parent):
        if self._slide_event is not None:
            self._slide_event.cancel()
            self._slide_event = None
        if parent is not None and len(self.sources) > 1:
            self._slide_event = Clock.schedule_interval(self._slide_suivant, 5)

    def _on_sources(self, _instance, sources):
        self._slide_index = 0
        self.source = sources[0] if sources else ""
        if self.parent is not None:
            self._on_parent(self, self.parent)

    def _slide_suivant(self, _dt):
        if self.parent is None or len(self.sources) < 2:
            return False
        self._slide_index = (self._slide_index + 1) % len(self.sources)
        self.source = self.sources[self._slide_index]
        return True


class GradientBackground(BoxLayout):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        texture = Texture.create(size=(1, 256), colorfmt="rgba")
        pixels = bytearray()
        top_color = (14, 30, 59)
        bottom_color = (19, 91, 102)
        for y in range(256):
            ratio = y / 255
            color = tuple(
                round(bottom + (top - bottom) * ratio)
                for top, bottom in zip(top_color, bottom_color)
            )
            pixels.extend((*color, 255))
        texture.blit_buffer(bytes(pixels), colorfmt="rgba", bufferfmt="ubyte")
        texture.wrap = "clamp_to_edge"
        texture.mag_filter = "linear"
        texture.min_filter = "linear"
        with self.canvas.before:
            Color(1, 1, 1, 1)
            self._gradient = Rectangle(texture=texture, pos=self.pos, size=self.size)
        self.bind(pos=self._actualiser_degrade, size=self._actualiser_degrade)

    def _actualiser_degrade(self, *_):
        self._gradient.pos = self.pos
        self._gradient.size = self.size


KV = """
<AnimatedLogo>:
    canvas.before:
        PushMatrix
        Scale:
            x: self.scale
            y: self.scale
            origin: self.center
    canvas.after:
        PopMatrix

<BaseNavigationItem>:
    MDNavigationItemIcon:
        icon: root.icon

    MDNavigationItemLabel:
        text: root.text

MDScreen:
    MDBoxLayout:
        orientation: "vertical"
        size_hint: None, None
        size: root.size
        pos: root.pos

        MDTopAppBar:
            title: "RESTO"

        MDScreenManager:
            id: screen_manager

            MDScreen:
                name: "accueil"
                ScrollView:
                    do_scroll_x: False
                    bar_width: "3dp"
                    GradientBackground:
                        orientation: "vertical"
                        size_hint_y: None
                        height: max(self.minimum_height, self.parent.height)
                        padding: ["20dp", "16dp", "20dp", "20dp"]
                        spacing: "12dp"
                        MDLabel:
                            text: app.accueil_titre
                            halign: "center"
                            text_size: self.width, None
                            font_size: "30sp"
                            bold: True
                            color: 1, 1, 1, 1
                            size_hint_y: None
                            height: self.texture_size[1] + dp(8)
                        AnimatedLogo:
                            id: home_logo
                            orientation: "vertical"
                            size_hint_y: None
                            height: "170dp"
                            spacing: "5dp"
                            MDIcon:
                                id: logo_icon
                                icon: "storefront"
                                font_size: "92sp"
                                theme_text_color: "Custom"
                                text_color: 1, 1, 1, 1
                                opacity: 0 if app.logo_available else 1
                            RelativeLayout:
                                size_hint_y: None
                                height: "120dp"
                                Image:
                                    id: logo_image
                                    source: app.logo_image
                                    opacity: 1 if app.logo_available else 0
                                    fit_mode: "contain"
                                    size_hint: 1, 1
                                Image:
                                    id: logo_image_next
                                    source: app.logo_next_image
                                    opacity: 0
                                    fit_mode: "contain"
                                    size_hint: 1, 1
                            MDLabel:
                                text: "LAUR&DOR"
                                halign: "center"
                                font_size: "22sp"
                                bold: True
                                color: 1, 1, 1, 1
                        MDLabel:
                            text: app.accueil_description
                            halign: "center"
                            text_size: self.width, None
                            font_size: "18sp"
                            color: 1, 1, 1, 1
                            size_hint_y: None
                            height: max(dp(60), self.texture_size[1] + dp(8))
                        MDBoxLayout:
                            orientation: "horizontal"
                            size_hint_x: 1
                            size_hint_y: None
                            height: "48dp"
                            spacing: "12dp"
                            MDButton:
                                id: produits_shortcut
                                style: "tonal"
                                size_hint_x: 1
                                on_release: app.ouvrir_onglet("produits")
                                MDButtonText:
                                    text: app.accueil_bouton_produits
                            MDButton:
                                id: infos_shortcut
                                style: "tonal"
                                size_hint_x: 1
                                on_release: app.ouvrir_onglet("infos")
                                MDButtonText:
                                    text: app.accueil_bouton_infos

            MDScreen:
                name: "produits"
                ScrollView:
                    MDBoxLayout:
                        id: produits_container
                        orientation: "vertical"
                        padding: "15dp"
                        spacing: "20dp"
                        size_hint_y: None
                        height: self.minimum_height
                        MDLabel:
                            text: "NOS PRODUITS"
                            halign: "center"
                            font_size: "30sp"
                            bold: True
                            size_hint_y: None
                            height: "50dp"

            MDScreen:
                name: "infos"
                ScrollView:
                    id: publications_scroll
                    MDBoxLayout:
                        id: publications_container
                        orientation: "vertical"
                        padding: "15dp"
                        spacing: "20dp"
                        size_hint_y: None
                        height: self.minimum_height
                        MDLabel:
                            text: app.infos_titre
                            halign: "center"
                            font_size: "30sp"
                            bold: True
                            size_hint_y: None
                            height: "50dp"

            MDScreen:
                name: "apropos"
                ScrollView:
                    do_scroll_x: False
                    bar_width: "3dp"
                    GradientBackground:
                        orientation: "vertical"
                        size_hint_y: None
                        height: max(self.minimum_height, self.parent.height)
                        padding: "20dp"
                        spacing: "20dp"
                        MDLabel:
                            text: app.apropos_titre
                            halign: "center"
                            text_size: self.width, None
                            font_size: "30sp"
                            bold: True
                            color: 1, 1, 1, 1
                            size_hint_y: None
                            height: self.texture_size[1] + dp(8)
                        FloatLayout:
                            size_hint_y: None
                            height: "240dp"
                            MDIcon:
                                icon: "account-circle"
                                font_size: "150sp"
                                theme_text_color: "Custom"
                                text_color: 0.75, 0.8, 0.88, 1
                                opacity: 0 if app.owner_photo_available else 1
                                pos_hint: {"center_x": 0.5, "center_y": 0.5}
                            Image:
                                source: app.owner_photo
                                opacity: 1 if app.owner_photo_available else 0
                                fit_mode: "contain"
                                size_hint: None, None
                                size: "220dp", "220dp"
                                pos_hint: {"center_x": 0.5, "center_y": 0.5}
                        MDLabel:
                            text: app.apropos_description
                            halign: "center"
                            text_size: self.width, None
                            font_size: "18sp"
                            color: 1, 1, 1, 1
                            size_hint_y: None
                            height: max(dp(90), self.texture_size[1] + dp(8))
                        Button:
                            text: "[u]{}[/u]".format(app.apropos_lien_texte)
                            markup: True
                            color: 0.78, 0.91, 1, 1
                            bold: True
                            font_size: "18sp"
                            background_normal: ""
                            background_color: 0, 0, 0, 0
                            text_size: self.width, None
                            size_hint_y: None
                            height: max(dp(48), self.texture_size[1] + dp(16))
                            on_release: app.ouvrir_site()
                        Button:
                            text: "[u]{}[/u]".format(app.apropos_contact_texte)
                            markup: True
                            color: 0.78, 0.91, 1, 1
                            bold: True
                            font_size: "18sp"
                            background_normal: ""
                            background_color: 0, 0, 0, 0
                            text_size: self.width, None
                            size_hint_y: None
                            height: max(dp(48), self.texture_size[1] + dp(16))
                            on_release: app.ouvrir_contact()

        MDNavigationBar:
            id: navigation_bar
            on_switch_tabs: app.on_switch_tabs(*args)
            BaseNavigationItem:
                icon: "home"
                text: "Accueil"
                screen_name: "accueil"
                active: True
            BaseNavigationItem:
                icon: "shopping"
                text: "Produits"
                screen_name: "produits"
            BaseNavigationItem:
                icon: "newspaper"
                text: "Infos"
                screen_name: "infos"
            BaseNavigationItem:
                icon: "information"
                text: "À propos"
                screen_name: "apropos"
"""


def kv_escape(value):
    if value is None:
        return ""
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


class VenteApp(MDApp):
    logo_image = StringProperty("")
    logo_next_image = StringProperty("")
    logo_available = BooleanProperty(False)
    owner_photo = StringProperty("")
    owner_photo_available = BooleanProperty(False)
    accueil_titre = StringProperty("Bienvenue chez Laur & Dor Gourmet")
    accueil_description = StringProperty(
        "Découvrez la carte et les actualités de notre restaurant."
    )
    accueil_bouton_produits = StringProperty("LA CARTE")
    accueil_bouton_infos = StringProperty("NOS INFOS/PUBS")
    infos_titre = StringProperty("INFOS & ACTUALITÉS")
    apropos_titre = StringProperty("À PROPOS")
    apropos_description = StringProperty(
        "Un restaurant où découvrir une cuisine généreuse et partager un bon moment."
    )
    apropos_lien_texte = StringProperty("RESTO WEB")
    apropos_lien_url = StringProperty("https://laur-dor.web.app")
    apropos_contact_texte = StringProperty("CONTACT")
    apropos_contact_url = StringProperty("https://laur-dor.web.app")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._database_executor = ThreadPoolExecutor(max_workers=3)
        self._publication_widgets = {}
        self._home_logo_paths = []
        self._home_logo_index = 0
        self._home_logo_active_id = "logo_image"
        self._home_logo_event = None
        self._app_started = False
        self._revision_tableau = None
        self._revision_tableau_initialisee = False

    def _programmer_animation_logo(self):
        if self._home_logo_event is not None:
            self._home_logo_event.cancel()
            self._home_logo_event = None
        if self._app_started and len(self._home_logo_paths) > 1:
            self._home_logo_event = Clock.schedule_interval(
                self._animer_logo_suivant, 3
            )

    def _animer_logo_suivant(self, _dt):
        if len(self._home_logo_paths) < 2 or self.root is None:
            return False

        current_index = self._home_logo_index
        next_index = (current_index + 1) % len(self._home_logo_paths)
        next_next_index = (next_index + 1) % len(self._home_logo_paths)
        outgoing = self.root.ids[self._home_logo_active_id]
        incoming_id = (
            "logo_image_next"
            if self._home_logo_active_id == "logo_image"
            else "logo_image"
        )
        incoming = self.root.ids[incoming_id]

        incoming.source = str(self._home_logo_paths[next_index])
        incoming.pos = (dp(48), 0)
        incoming.opacity = 0
        Animation(x=-dp(48), opacity=0, duration=0.45, t="out_quad").start(
            outgoing
        )

        def terminer_transition(*_):
            outgoing.x = dp(48)
            outgoing.source = str(self._home_logo_paths[next_next_index])
            self._home_logo_index = next_index
            self._home_logo_active_id = incoming_id

        incoming_animation = Animation(
            x=0, opacity=1, duration=0.45, t="out_quad"
        )
        incoming_animation.bind(on_complete=terminer_transition)
        incoming_animation.start(incoming)
        return True

    def _executer_en_arriere_plan(self, operation, on_success=None):
        future = self._database_executor.submit(operation)

        def terminer(tache):
            try:
                resultat = tache.result()
            except Exception as error:
                Clock.schedule_once(
                    lambda dt, error=error: self._afficher_erreur(error), 0
                )
                return
            if on_success:
                Clock.schedule_once(lambda dt: on_success(resultat), 0)

        future.add_done_callback(terminer)

    def _afficher_erreur(self, error):
        Popup(
            title="Erreur",
            content=KivyLabel(text=str(error)),
            size_hint=(0.9, None),
            height="180dp",
        ).open()

    def _charger_avec_images(self, collection_loader, image_indices):
        records = collection_loader()
        rows = []
        image_errors = []
        for row in records:
            resolved_row = list(row)
            for image_index in image_indices:
                try:
                    resolved_row[image_index] = image_locale(
                        row[image_index], self.user_data_dir
                    )
                except FirebaseError as error:
                    resolved_row[image_index] = ""
                    image_errors.append(str(error))
            rows.append(tuple(resolved_row))
        return rows, image_errors

    def _afficher_erreurs_images(self, image_errors):
        if image_errors:
            self._afficher_erreur(
                FirebaseError(
                    "Certaines images n'ont pas pu être chargées :\n"
                    + "\n".join(image_errors[:3])
                )
            )

    def commander_whatsapp(self, produit, prix, numero):
        numero = re.sub(r"[^0-9]", "", str(numero))
        if not 8 <= len(numero) <= 15:
            self._afficher_erreur(
                FirebaseError("Le numéro WhatsApp de ce produit n'est pas valide.")
            )
            return
        message = "Bonjour, je souhaite commander {} au prix de {}.".format(
            produit, prix
        )
        webbrowser.open("https://wa.me/{}?text={}".format(numero, quote(message)))

    def ouvrir_site(self):
        self._ouvrir_lien_web(self.apropos_lien_url, "site")

    def ouvrir_contact(self):
        self._ouvrir_lien_web(self.apropos_contact_url, "contact")

    def _ouvrir_lien_web(self, url, label):
        destination = url.strip()
        parsed_destination = urlparse(destination)
        if (
            parsed_destination.scheme != "https"
            or not parsed_destination.netloc
            or parsed_destination.username
            or parsed_destination.password
        ):
            self._afficher_erreur(
                FirebaseError(
                    "La destination du {} n'est pas une URL HTTPS valide.".format(
                        label
                    )
                )
            )
            return
        webbrowser.open(destination)

    def on_switch_tabs(self, bar, item, item_icon, item_text):
        self.root.ids.screen_manager.current = item.screen_name

    def ouvrir_onglet(self, screen_name):
        navigation_bar = self.root.ids.navigation_bar
        item = next(
            item
            for item in navigation_bar.children
            if item.screen_name == screen_name
        )
        navigation_bar.set_active_item(item)

    def afficher_produits(self):
        self._executer_en_arriere_plan(
            lambda: self._charger_avec_images(
                obtenir_produits, image_indices=(-4, -3, -2)
            ),
            self._afficher_produits,
        )

    def _afficher_produits(self, result):
        produits, image_errors = result
        container = self.root.ids.produits_container
        container.clear_widgets()
        container.add_widget(
            Builder.load_string(
                """
MDLabel:
    text: "NOS PRODUITS"
    halign: "center"
    font_size: "30sp"
    bold: True
    size_hint_y: None
    height: "50dp"
"""
            )
        )

        for (
            _,
            nom,
            prix,
            description,
            image_1,
            image_2,
            image_3,
            telephone_commande,
        ) in produits:
            carte = Builder.load_string(
                """
MDCard:
    orientation: "vertical"
    size_hint_y: None
    height: self.minimum_height
    padding: "10dp"
    spacing: "10dp"
    elevation: 3
    ImageCarousel:
        id: product_image_carousel
        size_hint_y: None
        height: "200dp"
    MDLabel:
        text: "{}"
        font_size: "22sp"
        bold: True
        halign: "center"
        text_size: self.width, None
        size_hint_y: None
        height: max(dp(40), self.texture_size[1] + dp(8))
    MDLabel:
        text: "{}"
        font_size: "20sp"
        halign: "center"
        text_size: self.width, None
        size_hint_y: None
        height: max(dp(40), self.texture_size[1] + dp(8))
    MDLabel:
        text: "{}"
        halign: "center"
        text_size: self.width, None
        size_hint_y: None
        height: max(dp(50), self.texture_size[1] + dp(8))
    MDButton:
        style: "filled"
        pos_hint: {{"center_x": 0.5}}
        size_hint_x: None
        size_hint_y: None
        width: "220dp"
        height: "48dp"
        on_release: app.commander_whatsapp("{}", "{}", "{}")
        MDButtonIcon:
            icon: "whatsapp"
        MDButtonText:
            text: "Commander"
""".format(
                    kv_escape(nom),
                    kv_escape(prix),
                    kv_escape(description),
                    kv_escape(nom),
                    kv_escape(prix),
                    kv_escape(telephone_commande or "22899057931"),
                )
            )
            carte.ids.product_image_carousel.sources = [
                image for image in (image_1, image_2, image_3) if image
            ]
            container.add_widget(carte)
        self._afficher_erreurs_images(image_errors)

    def afficher_publications(self, publication_id=None):
        self._executer_en_arriere_plan(
            lambda: self._charger_avec_images(
                obtenir_publications, image_indices=(-3, -2, -1)
            ),
            lambda result: self._afficher_publications(result, publication_id),
        )

    def _afficher_publications(self, result, publication_id=None):
        publications, image_errors = result
        container = self.root.ids.publications_container
        container.clear_widgets()
        container.add_widget(
            Builder.load_string(
                """
MDLabel:
    text: "INFOS & ACTUALITÉS"
    halign: "center"
    font_size: "30sp"
    bold: True
    size_hint_y: None
    height: "50dp"
"""
            )
        )
        self._publication_widgets = {}

        for (
            id_publication,
            titre,
            contenu,
            date,
            image_1,
            image_2,
            image_3,
        ) in publications:
            carte = Builder.load_string(
                """
MDCard:
    orientation: "vertical"
    size_hint_y: None
    height: self.minimum_height
    padding: "10dp"
    spacing: "10dp"
    elevation: 3
    ImageCarousel:
        id: publication_image_carousel
        size_hint_y: None
        height: "200dp"
    MDLabel:
        text: "{}"
        font_size: "22sp"
        bold: True
        halign: "center"
        text_size: self.width, None
        size_hint_y: None
        height: max(dp(45), self.texture_size[1] + dp(8))
    MDLabel:
        text: "{}"
        font_size: "15sp"
        halign: "center"
        text_size: self.width, None
        size_hint_y: None
        height: max(dp(30), self.texture_size[1] + dp(8))
    MDLabel:
        text: "{}"
        font_size: "16sp"
        halign: "center"
        text_size: self.width, None
        size_hint_y: None
        height: max(dp(100), self.texture_size[1] + dp(8))
""".format(
                    kv_escape(titre),
                    kv_escape(date),
                    kv_escape(contenu),
                )
            )
            carte.ids.publication_image_carousel.sources = [
                image for image in (image_1, image_2, image_3) if image
            ]
            container.add_widget(carte)
            self._publication_widgets[str(id_publication)] = carte

        if publication_id is not None:
            target = self._publication_widgets.get(str(publication_id))
            self.root.ids.screen_manager.current = "infos"
            if target is None:
                self._afficher_erreur(
                    FirebaseError(
                        "La publication demandée par la notification n'existe plus."
                    )
                )
            else:
                Clock.schedule_once(
                    lambda dt: self.root.ids.publications_scroll.scroll_to(
                        target, padding=12
                    ),
                    0.2,
                )
        self._afficher_erreurs_images(image_errors)

    def _consommer_intention_notification(self, intent=None):
        if intent is None:
            try:
                from jnius import autoclass

                activity_class = autoclass("org.kivy.android.PythonActivity")
                intent = activity_class.mActivity.getIntent()
            except (ImportError, AttributeError, RuntimeError):
                return False
        try:
            publication_id = intent.getStringExtra("annonce_id")
        except (AttributeError, RuntimeError):
            return False
        if not publication_id:
            return False
        try:
            intent.removeExtra("annonce_id")
        except (AttributeError, RuntimeError):
            pass
        self.afficher_publications(publication_id)
        return True

    def _on_new_intent(self, *args):
        for value in reversed(args):
            if hasattr(value, "getStringExtra"):
                self._consommer_intention_notification(value)
                return
        self._consommer_intention_notification()

    def on_start(self):
        animation = Animation(
            scale=1.12, duration=0.8, t="in_out_quad"
        ) + Animation(
            scale=1, duration=0.8, t="in_out_quad"
        )
        animation.repeat = True
        animation.start(self.root.ids.home_logo)
        blink = Animation(opacity=0.3, duration=0.55) + Animation(
            opacity=1, duration=0.55
        )
        blink.repeat = True
        blink.start(self.root.ids.produits_shortcut)
        blink.start(self.root.ids.infos_shortcut)
        self._app_started = True
        self._programmer_animation_logo()
        if activity is not None:
            activity.bind(on_new_intent=self._on_new_intent)
        self._demander_permission_notifications()
        self._consommer_intention_notification()

    def _demander_permission_notifications(self):
        if (
            activity is None
            or check_permission is None
            or request_permissions is None
        ):
            return
        from jnius import autoclass

        if autoclass("android.os.Build$VERSION").SDK_INT < 33:
            return
        if not check_permission(ANDROID_NOTIFICATION_PERMISSION):
            request_permissions([ANDROID_NOTIFICATION_PERMISSION])

    def on_pause(self):
        return True

    def _connexion_internet_disponible(self):
        if activity is None:
            return True

        try:
            from jnius import JavaException, autoclass

            app_activity = autoclass(
                "org.kivy.android.PythonActivity"
            ).mActivity
            connectivity_manager = app_activity.getSystemService("connectivity")
            network = connectivity_manager.getActiveNetwork()
            if network is None:
                return False

            capabilities = connectivity_manager.getNetworkCapabilities(network)
            if capabilities is None:
                return False

            network_capabilities = autoclass("android.net.NetworkCapabilities")
            return capabilities.hasCapability(
                network_capabilities.NET_CAPABILITY_VALIDATED
            )
        except (ImportError, AttributeError, RuntimeError, JavaException) as error:
            Logger.exception(
                "RESTO: impossible de vérifier la connexion Internet: "
                + str(error)
            )
            return False

    def on_resume(self):
        if not self._connexion_internet_disponible():
            return

        self._executer_en_arriere_plan(
            obtenir_revision_tableau,
            self._actualiser_si_revision_modifiee,
        )

    def _memoriser_revision_tableau(self, revision):
        self._revision_tableau = revision
        self._revision_tableau_initialisee = True

    def _actualiser_si_revision_modifiee(self, revision):
        if not self._revision_tableau_initialisee:
            self._memoriser_revision_tableau(revision)
            return
        if revision == self._revision_tableau:
            return

        self._memoriser_revision_tableau(revision)
        self._executer_en_arriere_plan(
            self._charger_contenu_application,
            self._appliquer_contenu_application,
        )
        self.afficher_produits()
        if not self._consommer_intention_notification():
            self.afficher_publications()

    def _charger_contenu_application(self):
        content = obtenir_contenu_application()
        home = content.get("accueil", {})
        about = content.get("apropos", {})
        images_dir = Path(__file__).resolve().parent / "images"
        default_logos = [
            images_dir / "logo.png",
            images_dir / "logo1.png",
            images_dir / "logo2.png",
            images_dir / "logo3.png",
        ]
        logos = []
        image_errors = []
        for index, fallback in enumerate(default_logos, start=1):
            reference = home.get("logo_{}".format(index), str(fallback))
            try:
                image_path = image_locale(reference, self.user_data_dir)
            except FirebaseError as error:
                image_path = ""
                image_errors.append(str(error))
            if image_path:
                logos.append(image_path)
            elif fallback.is_file():
                logos.append(str(fallback))

        photo_fallback = images_dir / "proprietaire.jpg"
        photo_reference = about.get("photo", str(photo_fallback))
        try:
            photo = image_locale(photo_reference, self.user_data_dir)
        except FirebaseError as error:
            photo = ""
            image_errors.append(str(error))
        if not photo and photo_fallback.is_file():
            photo = str(photo_fallback)

        return {
            "home": home,
            "about": about,
            "logos": logos,
            "photo": photo,
            "image_errors": image_errors,
        }

    def _appliquer_contenu_application(self, result):
        home = result["home"]
        about = result["about"]
        self.accueil_titre = home.get(
            "accueil_titre", "Bienvenue chez Laur & Dor Gourmet"
        )
        self.accueil_description = home.get(
            "accueil_description",
            "Découvrez la carte et les actualités de notre restaurant.",
        )
        self.accueil_bouton_produits = home.get(
            "accueil_bouton_produits", "LA CARTE"
        )
        self.accueil_bouton_infos = home.get(
            "accueil_bouton_infos", "NOS INFOS"
        )
        self.infos_titre = about.get("infos_titre", "INFOS & ACTUALITÉS")
        self.apropos_titre = about.get("apropos_titre", "À PROPOS")
        self.apropos_description = about.get(
            "apropos_description",
            "Un restaurant où découvrir une cuisine généreuse et partager un bon moment.",
        )
        self.apropos_lien_texte = about.get(
            "apropos_lien_texte", "RESTO WEB"
        )
        self.apropos_lien_url = about.get(
            "apropos_lien_url", "https://laur-dor.web.app"
        )
        self.apropos_contact_texte = about.get(
            "apropos_contact_texte", "CONTACT"
        )
        self.apropos_contact_url = about.get(
            "apropos_contact_url", "https://laur-dor.web.app"
        )

        self._home_logo_paths = result["logos"]
        self._programmer_animation_logo()
        self.logo_available = bool(self._home_logo_paths)
        if self.logo_available:
            self._home_logo_index = 0
            self._home_logo_active_id = "logo_image"
            self.logo_image = self._home_logo_paths[0]
            self.logo_next_image = (
                self._home_logo_paths[1]
                if len(self._home_logo_paths) > 1
                else self._home_logo_paths[0]
            )
        self.owner_photo = result["photo"]
        self.owner_photo_available = bool(self.owner_photo)
        self._afficher_erreurs_images(result["image_errors"])

    def build(self):
        images_dir = Path(__file__).resolve().parent / "images"
        logo = images_dir / "logo.png"
        self._home_logo_paths = [logo] if logo.is_file() else []
        logo_index = 1
        while (images_dir / "logo{}.png".format(logo_index)).is_file():
            self._home_logo_paths.append(
                images_dir / "logo{}.png".format(logo_index)
            )
            logo_index += 1
        self.logo_available = bool(self._home_logo_paths)
        if self.logo_available:
            self.logo_image = str(self._home_logo_paths[0])
            self.logo_next_image = str(
                self._home_logo_paths[1]
                if len(self._home_logo_paths) > 1
                else self._home_logo_paths[0]
            )
        owner_photo = images_dir / "proprietaire.jpg"
        self.owner_photo_available = owner_photo.is_file()
        if self.owner_photo_available:
            self.owner_photo = str(owner_photo)
        interface = Builder.load_string(KV)
        self.root = interface
        self._executer_en_arriere_plan(
            obtenir_revision_tableau,
            self._memoriser_revision_tableau,
        )
        self._executer_en_arriere_plan(
            self._charger_contenu_application,
            self._appliquer_contenu_application,
        )
        self.afficher_produits()
        self.afficher_publications()
        return interface


if __name__ == "__main__":
    VenteApp().run()
