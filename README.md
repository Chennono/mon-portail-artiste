# Mon Portail Artiste

Prototype recherche + MVP pour generer un portail professionnel d'artiste visuel par conversation avec une IA.

## Objectif

Le prototype teste l'idee que le portail personnel d'un artiste est une infrastructure professionnelle: visibilite, signal de reputation, archivage des oeuvres, aggregation des plateformes, production de dossiers et communication avec les institutions.

## Direction UI

L'interface est inspiree des codes France Travail / service public, sans pretendre etre un service officiel:

- en-tete institutionnel avec mention `Prototype non officiel`;
- structure en deux etapes lisibles: conversation puis apercu;
- boutons, champs, focus et messages dans un style sobre, accessible et proche DSFR;
- police Marianne (police de l'Etat) chargee via le CDN jsDelivr (`@gouvfr/dsfr`), avec repli system-ui si le reseau est indisponible;
- accents artistiques limites aux rails de couleur, au rendu du portail et aux variantes visuelles.

> Note: la police Marianne via CDN introduit une dependance reseau (le reste du prototype fonctionne hors-ligne). Pour un usage 100% local, telecharger les `.woff2` Marianne et adapter les regles `@font-face` dans `styles.css`.

## Utilisation

Ouvrir `index.html` dans un navigateur moderne.

Fonctions incluses:

- choix du metier (Artiste / Technicien·ne du spectacle / Administration-production): adapte la page generee (intitule du role, presentation, parcours, intitules de sections, vocabulaire et valeurs par defaut) pour un rendu specifique a chaque profession;
- champ specifique au metier, qui devient une section dediee de la page: Formation & distinctions (artiste), Habilitations & certifications / CACES (technicien·ne), Structures & budgets (administration). Question guidee correspondante posee selon le metier choisi;
- un fil d'etapes (Racontez / Creez / Verifiez et exportez) qui suit la progression;
- une zone d'echange avec un assistant local guide (par defaut, generation locale dans le navigateur, sans reseau);
- selection du public cible par etiquettes (commissaires, galeries, residences, institutions, collectionneurs, grand public), integree au texte genere;
- generation locale d'un brouillon de portail a partir de la conversation;
- choix de la voix du texte: premiere personne ("je") ou troisieme personne (au nom de l'artiste);
- envoi du message a la touche Entree (style messagerie), Maj+Entree pour un retour a la ligne (saisie IME chinois/japonais protegee);
- module SEO replie par defaut dans l'apercu (meta non affichee publiquement, toujours editable et reprise dans les balises de l'export);
- modification et suppression de chaque message deja envoye dans la conversation;
- bouton "Effacer la saisie" pour vider le champ de message en cours;
- edition en place signalee dans l'apercu (textes cliquables et modifiables);
- edition modulaire du portail genere: ajout de modules libres (texte, oeuvres, contact, liens, note), suppression de modules, changement de colonne, deplacement par fleches ou glisser-deposer;
- controle typographique du texte selectionne dans l'apercu: graisse, italique, taille, interligne, alignement et espacement, avec styles memorises et inclus dans l'export HTML;
- saisie libre des oeuvres dans le composer (titre, annee, medium, description libre), prioritaire sur l'extraction automatique du texte;
- gestion des oeuvres: ajout, suppression et edition directe (titre, annee, medium, description);
- gestion des images: suppression unitaire, texte alternatif editable, association explicite a une oeuvre ou au visuel principal;
- choix de style visuel: calme professionnel, galerie, editorial, sombre immersif;
- mise en page de la page generee (independante du style de couleur): editorial/revue (par defaut), colonnes (standard), une colonne centree, affiche (titre geant), mosaique (masonry), defilement horizontal des oeuvres. Memorisee et incluse dans l'export HTML;
- la mise en page "editorial" (par defaut) reduit l'effet CV: presentation transformee en grande accroche sans etiquette, libelles de section en petits intertitres discrets, encadres plats et aeres;
- bouton d'envoi dedie sous la zone de saisie (en plus de la touche Entree);
- choix libre des polices, separement pour les titres et pour le texte. Polices systeme (Marianne, Georgia, Times, Helvetica, Courier) et polices d'art chargees a la demande: Playfair Display, Space Grotesk, DM Serif Display, Syne, Abril Fatface, Cormorant Garamond, Bodoni Moda, Caveat (manuscrit), Bricolage Grotesque. "Selon le style" par defaut. Memorise et inclus dans l'export (avec les liens de polices necessaires);
- galerie de styles cliquable (vignettes synchronisees avec le selecteur de style);
- couleurs de la page: palettes preetablies (Sable, Ocean, Foret, Encre, Rose, Nuit), fond et accent personnalisables (selecteurs de couleur, contraste du texte calcule automatiquement), intensite du degrade reglable, et bouton "Generer un fond" (palette harmonieuse generee localement). Les visuels abstraits generes (canvas) reprennent automatiquement la palette choisie. Les couleurs sont independantes du style de mise en page, memorisees et incluses dans l'export HTML;
- module "Partager mon portail" apres generation: lien public a renseigner, textes prets a copier pour LinkedIn, Instagram bio, Facebook et TikTok bio, carte visuelle PNG et kit social `.txt`. Rien n'est publie automatiquement: l'artiste confirme et poste lui-meme/elle-meme;
- section "usages" (candidater / presenter / rassembler) et accroche sur la dependance aux plateformes;
- bascule de langue de l'interface: francais / anglais / chinois (voir limites ci-dessous);
- choix de mouvement: aucun, transition legere, page dynamique;
- mode "conversation guidee": l'assistant pose une question a la fois (nom, lieu, medium, themes, oeuvres, public, objectifs, contact), avec des relances chaleureuses; les reponses sont rattachees a leur champ et alimentent directement la page;
- en mode guide, une reponse dictee est envoyee automatiquement a la fin de la dictee, et les questions peuvent etre lues a voix haute (synthese vocale, optionnelle);
- saisie vocale directement dans le message de chat;
- connecteur optionnel vers un proxy LLM;
- import d'images local, stocke dans IndexedDB (resiste aux limites de localStorage);
- etats de chargement et boutons desactives pendant la generation/export;
- garde-fou: confirmation avant export/impression si la liste de verification n'est pas cochee;
- export HTML, JSON et impression press kit;
- suppression des donnees locales (localStorage + IndexedDB);
- sections recherche et conformite.

### Bascule de langue (FR / EN / 中文)

Le selecteur de langue (en-tete) traduit l'interface (navigation, titres, libelles, boutons, etiquettes, sections). Le choix est memorise (`localStorage`).

Limites assumees pour ce prototype:

- le contenu du portail genere (presentation, bio, titres de sections de l'apercu) reste dans la langue d'ecriture de l'artiste, car le generateur local est concu pour le francais;
- les messages d'etat transitoires (zone de statut) restent en francais.

## Styles de page

Deux controles permettent de personnaliser le rendu avant ou apres generation:

- `Style de page`: calme professionnel, galerie d'oeuvres, magazine artistique, sombre immersif.
- `Animation`: sans animation, transitions legeres, ou rendu dynamique avec apparition des sections et mouvement lent du visuel principal.

Les choix sont sauvegardes localement et inclus dans l'export HTML. Les animations respectent le reglage systeme `prefers-reduced-motion`.

## Position de conformite

Ce prototype ne pretend pas etre certifie par France Travail. Il applique une posture de service public:

- RGAA 4.1.2: semantique HTML, navigation clavier, contraste, labels de formulaire, alternative text;
- RGPD/CNIL: minimisation, stockage local effacable, export, consentement humain avant publication;
- EU AI Act: pas de scoring, pas de tri de candidats, pas de decision automatisee;
- UX inspiree DSFR: simple, lisible, fiable, orientee tache.

## Integration LLM

La page fonctionne sans reseau avec un generateur local. Pour brancher un modele, renseigner un endpoint proxy dans "Option avancée : connecter un modèle d'IA".

Le proxy doit accepter:

```json
{
  "mode": "chat",
  "messages": [],
  "prompt": "...",
  "images": []
}
```

En mode `chat`, il peut renvoyer:

```json
{
  "reply": "Question courte ou synthese."
}
```

En mode `generate`, il doit renvoyer un JSON contenant au minimum:

```json
{
  "name": "Nom",
  "location": "Ville",
  "tagline": "Phrase courte",
  "statement": "Artist statement",
  "bio": "Bio courte",
  "goals": "Objectifs",
  "contact": "contact@example.com",
  "seo": "Resume SEO",
  "keywords": ["art", "portfolio"],
  "works": [
    {
      "title": "Titre",
      "year": "2026",
      "medium": "Medium",
      "description": "Description"
    }
  ],
  "links": ["https://..."],
  "complianceNote": "Assisté par IA, relu par l'artiste"
}
```

Ne pas exposer de cle API directement dans cette page statique pour un deploiement reel.

## Saisie vocale

Le bouton "Dicter" utilise l'API Web Speech quand elle est disponible dans le navigateur.

- Choisir la langue: francais, chinois mandarin ou anglais.
- Cliquer sur "Dicter", parler, puis cliquer sur "Arrêter la dictée".
- Le texte reconnu est ajoute dans le message de chat.

Si le navigateur ne supporte pas cette API, le prototype affiche un badge "Dictée indisponible". Dans ce cas, utiliser Chrome/Edge ou la dictee vocale du systeme d'exploitation.

## Protocole de test

- 5-8 artistes visuels avec niveaux numeriques varies.
- 15-20 minutes pour produire un brouillon par conversation.
- Mesurer temps, completion, satisfaction, comprehension, intention d'usage, sentiment de controle.
- Verifier accessibilite, droits d'image, exactitude des faits et protection des donnees.
