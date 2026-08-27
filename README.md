# Hebrew Verb Atlas

A zero-build GitHub Pages site for browsing the reviewed modern-Hebrew verb dataset in `verbs.canonical.json`.

## Local preview

Run this from the repository directory:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Publishing

The repository is currently on `main` and includes the custom domain in `CNAME`. If GitHub Pages is configured to publish from the root of `main`, committing and pushing these files will publish the update:

```sh
git add .nojekyll index.html styles.css app.js favicon.svg README.md verbs.canonical.json
git commit -m "Update site to canonical verb dataset"
git push origin main
```

The legacy `verbs.json` remains in the repository for history, but the site no longer loads it.

## Dataset and interface policy

- 131 retained modern-Hebrew verb entries
- standard binyan order: Paal, Nifal, Piel, Pual, Hifil, Hufal, Hitpael
- study order: present, past, future, imperative, infinitive
- common plural future and imperative forms are favored over formal feminine-plural variants
- no standalone invented Hufal infinitives
