# Alephbetical Hebrew Verbs

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
git add -A
git commit -m "Rebuild canonical verb site and audio"
git push origin main
```

The legacy `verbs.json` remains in the repository for history, but the site no longer loads it.
The obsolete numbered audio directories were replaced by `audio-v2`, with separate
Tamar and Doron paths. A recoverable local copy is stored outside the repository at
`/home/negentrope/GPT/Site/Verbs-audio-legacy-20260827`.

Fresh Narakeet input lists, mapping tables, reproducible batch files, and rebuild
instructions are under `audio-generation/`.

## Dataset and interface policy

- 131 retained modern-Hebrew verb entries
- standard binyan order: Paal, Nifal, Piel, Pual, Hifil, Hufal, Hitpael
- study order: present, past, future, imperative, infinitive
- common plural future and imperative forms are favored over formal feminine-plural variants
- no standalone invented Hufal infinitives
- selectable Tamar and Doron audio for every conjugation and available example sentence
