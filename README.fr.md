# Useless LinkedIn

**Un Skill pour chercher un emploi en France : trouver des offres, préparer ses documents, postuler et assurer le suivi en langage naturel.**

[中文](README.md) · [English](README.en.md) · Français

Partagez votre CV et vos objectifs. L’agent vérifie la validité des offres, les doublons et les critères indispensables, prépare le CV, la lettre et les réponses, postule dans le cadre de votre autorisation, puis met à jour un tableau de suivi local. Les métiers, types de contrat, lieux et dates de début se configurent selon vos critères.

## Présentation du projet

Useless LinkedIn rassemble les opérations de recherche d’emploi dans un workflow documenté qui peut être repris après une interruption. Il se concentre sur la France, avec des métiers et types de contrat configurables, et recherche sur plusieurs sites, pas seulement LinkedIn. Il s’installe comme un seul Skill pour un agent ; le tableau de suivi local et l’éditeur de documents offrent des interfaces visuelles.

Le projet répond à trois difficultés fréquentes : répéter les recherches et la sélection sur plusieurs sites, préparer les documents pour chaque poste, puis garder une trace fiable des résultats et des relances.

### Fonctionnalités principales

| Fonction | Ce que propose le projet |
|---|---|
| Recherche et évaluation | Utilise successivement les API, la lecture de pages, le navigateur intégré et la recherche de l’agent ; vérifie la validité, les doublons et les critères indispensables, puis fournit une analyse étayée. |
| Parcours et documents | Conserve une seule base de faits vérifiés ; adapte CV, lettres et réponses aux postes prioritaires, réutilise les CV généraux contrôlés pour les lots, puis exporte et vérifie les PDF. |
| Candidatures et relances | Postule dans le cadre de l’autorisation, distingue documents prêts, résultats à confirmer et candidatures envoyées, puis conserve les confirmations, prochaines actions et dates de relance. |
| Gestion visuelle | Le tableau local présente la vue d’ensemble, les tendances et les fiches ; l’éditeur ajuste les documents existants. Les deux interfaces proposent le chinois, l’anglais et le français. |

### Principes de conception

**Vérifier les faits, les réutiliser et garder une trace de chaque étape.** Les recommandations reposent sur les exigences de l’offre et le parcours réel ; le statut d’envoi repose sur une confirmation. Après modification, les documents sont contrôlés à nouveau. Une exécution interrompue reprend à partir des traces enregistrées, pour éviter les doublons et ne pas confondre une tentative avec une tâche terminée.

Les outils et données personnelles sont séparés : le Skill peut être mis à jour tout en conservant votre profil, vos documents et votre registre. Le workflow relie **Career Memory → Job Intelligence → Application Engine → Pipeline**, en adaptant des concepts de plusieurs projets open source ; voir les [crédits et licences](THIRD_PARTY_NOTICES.md). L’accès aux sites, la connexion et les informations obligatoires conditionnent l’automatisation. Le projet ne garantit pas une embauche.

## Parcours d’utilisation

**Vérifier les tâches en attente → chercher ou lire une offre → sélectionner → préparer et contrôler les documents → postuler et vérifier la confirmation → mettre à jour le suivi et les dates de relance**. Vous pouvez aussi demander une seule étape.

## 1. Installation et première configuration

Utilisez un agent capable d’accéder aux fichiers locaux et au Web, par exemple l’application de bureau Codex. Ouvrez un dossier dédié à votre recherche d’emploi, puis envoyez :

```text
Installe le Skill situé à la racine de la branche Test du dépôt
https://github.com/ziyuan-404/Useless-LinkedIn sous le nom useless-linkedin.
Conserve le paquet complet et INSTALL.md.
Indique si je dois rouvrir la conversation après l’installation.
```

Sans outil d’installation de Skills, sélectionnez **branche Test → Code → Download ZIP** sur GitHub, décompressez l’archive et demandez à l’agent de lire `SKILL.md` à la racine.

Joignez votre CV Word ou PDF et adaptez les éléments entre crochets :

```text
Utilise $useless-linkedin et suis SKILL.md et INSTALL.md pour la configuration.
Espace personnel : [dossier distinct du répertoire d’installation du Skill].
Mon CV est joint.
Métiers visés : [métiers] ; lieux : [villes françaises, télétravail ou trajet maximal].
Type de contrat : [votre choix] ; date de début : [date].
Langues, formation, autorisation de travail et autres contraintes : [faits réels ;
préciser ce qui reste incertain].

Installe les dépendances, initialise l’espace, configure les recherches et les
modèles de documents, constitue une seule base d’expériences vérifiées et
vérifie le démarrage du tableau de suivi et de l’éditeur.
Conserve mon CV original et les données existantes. Demande-moi de clarifier
les faits manquants ou contradictoires.
Teste la sélection, la génération des documents et le suivi avec une offre.
Ne soumets pas encore de candidature et n’envoie aucun message.
```

**L’agent configure automatiquement le tableau de suivi.** Selon [INSTALL.md](INSTALL.md), il vérifie Node.js 24+ et Python 3.10+, installe les dépendances et lance l’installateur pour créer un registre vide et les lanceurs. Vous n’avez pas à créer la base de données ni à définir les variables d’environnement ; les demandes d’autorisation administrateur restent à votre charge. Télécharger le Skill ne lance pas l’installation et ne crée pas de tâche planifiée.

Les outils restent dans le répertoire du Skill ; vos CV, expériences, candidatures et documents se trouvent dans l’espace personnel distinct. Votre profil doit ensuite être établi à partir de vos documents réels.

## 2. Utilisation quotidienne

Dans l’espace configuré, appelez `$useless-linkedin` et décrivez la tâche :

| Objectif | Exemple de demande |
|---|---|
| Trouver des offres | Trouve 10 nouvelles offres en France selon mes critères, vérifie les doublons et classe-les par priorité. |
| Évaluer une offre | Analyse ce lien ou cette description : critères indispensables, preuves dans mon parcours et historique des candidatures. Explique ta recommandation. |
| Préparer les documents | Adapte mon CV, ma lettre et mes réponses à cette offre, puis montre les aperçus PDF finaux. |
| Préparer un lot | Sélectionne les offres compatibles et choisis mes CV généraux déjà vérifiés. |
| Postuler | Selon mon autorisation enregistrée, vérifie les documents, postule, conserve la confirmation et mets à jour le tableau. |
| Relancer et faire le bilan | Vérifie les relances dues et les envois à confirmer, organise la suite et rédige des brouillons de relance. |

Pour changer les critères, dites par exemple : « Priorité aux postes d’analyste de données à Lyon » ou « Un CV français d’une page mettant en avant mes projets réels ». Aucune réinstallation n’est nécessaire.

Si la description complète ou un fait indispensable manque, l’agent doit le signaler. **Cliquer sur Envoyer ou téléverser un fichier ne prouve pas la réussite.** La candidature est enregistrée comme envoyée après vérification de la page de confirmation, du courriel ou du statut sur la plateforme. Les courriels et messages aux contacts nécessitent leur propre autorisation ; un brouillon n’est pas un message envoyé.

## 3. Tableau de suivi des candidatures (Dashboard)

### Démarrage et configuration

Après l’installation, double-cliquez dans votre espace personnel sur :

- **Windows :** `打开Dashboard.cmd`
- **macOS :** `打开Dashboard.command` (créé par l’agent lors de l’installation sur Mac)

Le lanceur démarre et surveille les deux services, puis ouvre le tableau. Gardez sa fenêtre ouverte ; la navigation en haut permet d’accéder à l’éditeur.

Adresses par défaut : tableau `http://127.0.0.1:8765/`, éditeur `http://127.0.0.1:8766/`. Les services écoutent uniquement sur votre ordinateur, sans compte supplémentaire. Le registre se trouve dans votre espace à `个人资料/dashboard/applications.sqlite`.

Pour une page inaccessible, un Skill déplacé ou un historique Excel à importer, demandez :

```text
Vérifie cet espace selon INSTALL.md et le workflow du tableau de suivi.
Corrige les dépendances, les chemins des lanceurs ou les conflits de ports.
Relance l’installateur si nécessaire pour compléter les fichiers manquants,
en conservant mes données personnelles et le registre existant.
Si je fournis un historique Excel, importe-le en lecture seule, vérifie le
résultat et conserve l’original.
```

### Utiliser la page

1. **Consulter la vue d’ensemble.** Cliquez sur un compteur : relances dues, actions vous concernant, envois à confirmer ou confirmés. La tendance des 21 derniers jours reste visible ; les anciens envois non vérifiés sont distingués des candidatures dont la confirmation a été vérifiée.
2. **Trouver une fiche.** Recherchez une entreprise, un poste, un lien ou un identifiant ; filtrez par statut ou initiale et changez le tri. Les vues rapides signalent les descriptions manquantes ou les étapes contradictoires. À droite, choisissez 10, 20 ou 50 fiches par page.
3. **Ajouter ou modifier.** Renseignez le poste, le statut d’exécution, l’adéquation, la prochaine action et la date de relance. Les cases d’étape autorisent une seule sélection. Les modifications conservent un historique ; quitter sans enregistrer déclenche un avertissement.
4. **Vérifier la confirmation.** Saisir une description de preuve ne suffit pas : vérifiez la confirmation originale ou le résultat sur la plateforme.

![Données fictives : candidatures et filtres](docs/media/dashboard.gif)

Les deux interfaces proposent **中文 / English / Français** et conservent la langue après rechargement. Ce choix ne traduit pas vos notes de candidature ni le contenu de vos documents.

![Données fictives : changement de langue](docs/media/interface-languages.gif)

Les champs et règles de maintenance sont décrits dans le [workflow du tableau de suivi](references/dashboard-workflow.md).

## 4. Éditeur de documents

Il permet d’ajuster les CV et lettres déjà générés par l’agent pour une offre. Préparez d’abord les documents : ils doivent se trouver dans un dossier de candidature sous `个人资料/CV/`, dans votre espace. L’éditeur ne convertit pas directement n’importe quel fichier Word ou PDF en document modifiable.

1. Ouvrez l’éditeur depuis le tableau, choisissez le dossier et le type de document, puis cliquez sur **Ouvrir le document**.
2. Cliquez sur un élément pour le sélectionner, double-cliquez sur le texte pour le modifier, puis faites glisser l’élément ou ses bords pour le déplacer ou le redimensionner.
3. Le panneau de propriétés contrôle le texte, les images, la taille de police, les couleurs, l’opacité et l’ordre des éléments. Vérifiez toute la page pour repérer les chevauchements ou débordements.
4. Cliquez sur **Enregistrer et générer le PDF**. En cas de réussite, le HTML, le PDF et l’aperçu sont actualisés ; l’ancienne version est conservée dans `work/editor-history/` du dossier. En cas d’échec, les fichiers existants et les modifications en cours sont conservés.
5. Demandez à l’agent de vérifier à nouveau les faits, le texte du PDF et la mise en page avant de postuler. Modifier les fichiers invalide le contrôle précédent.

![Document fictif : ouverture et modification](docs/media/document-editor.gif)

*Les GIF utilisent des entreprises, postes et documents fictifs, sans candidature réelle ni CV personnel.*

Changer de document ou quitter avec des modifications non enregistrées déclenche un avertissement. Consultez le [workflow de l’éditeur](references/editor-workflow.md).

## 5. Exécution planifiée (facultatif)

Testez le parcours complet et enregistrez le périmètre de votre autorisation de candidature. Demandez ensuite à une plateforme d’agent prenant en charge les tâches locales planifiées de créer une tâche, par exemple :

```text
Crée une tâche pour cet espace personnel : chaque jour ouvré à 9 h,
fuseau Europe/Paris. Utilise $useless-linkedin pour traiter au plus
10 nouvelles offres selon mes critères.
Commence par les tâches inachevées et les relances, puis vérifie les nouvelles
offres et prépare et contrôle les documents.
Postule selon mon autorisation enregistrée et mets à jour le tableau après
vérification de la confirmation.
Les vérifications de sécurité, connexions expirées et faits indispensables
inconnus ne bloquent que l’offre concernée ; poursuis les autres offres possibles.
Résume les candidatures envoyées, les blocages et la suite.
Évite les candidatures en double et les messages non autorisés.
```

Pour les tâches locales, l’ordinateur doit rester allumé et connecté, avec la plateforme et l’espace accessibles. L’agent vérifie la création, l’activation et les exécutions ; installer le Skill ne lance pas les candidatures. Voir le [cycle quotidien](workflows/daily-cycle.md) et le [plan d’exécution autonome](workflows/unattended-run.md).

## Pour aller plus loin

- [Installation](INSTALL.md) · [Configuration technique et dépannage (en chinois)](docs/技术配置指南.md)
- [Confidentialité](PRIVACY.md) : ne publiez pas vos CV réels, coordonnées, candidatures ou données de connexion. Le stockage local ne signifie pas que le traitement par le modèle est entièrement hors ligne.
- [Licence MIT](LICENSE) · [Crédits et licences tierces](THIRD_PARTY_NOTICES.md) : les ressources d’ApplyPilot, Personal Career OS, resume-builder et career-ops conservent leurs licences respectives.

*Les guides détaillés sont principalement en chinois ; demandez à l’agent de vous expliquer les étapes en français.*
