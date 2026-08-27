# Audio generation

This directory rebuilds the canonical Hebrew audio without relying on anonymous
Narakeet filenames.

The generated lists are derived directly from `../verbs.canonical.json`:

- `generated/lists/conjugations.txt` — one Hebrew conjugation per dataset row
- `generated/lists/example-sentences.txt` — one accepted Hebrew sentence per row
- matching TSV files — dataset key, tense, row, pronoun, batch, scene and target path
- `generated/batches/*.txt` — Narakeet multi-scene input files (at most 450 scenes)

Audio is written to deterministic, voice-specific paths, for example:

```text
audio-v2/tamar/conjugations/katav/past-01.mp3
audio-v2/doron/examples/katav/past-01.mp3
```

Prepare or refresh the lists without using the network:

```sh
python3 audio-generation/audio_pipeline.py prepare
```

Build both voices. The API key is read only from the environment and is never
written to a manifest, log, source file, or dataset:

```sh
export NARAKEET_API_KEY="..."
python3 audio-generation/audio_pipeline.py build --voices Tamar Doron
```

The build is resumable at individual clips: existing audio is skipped and only
missing targets are grouped into new batches. After both voices finish, verify
the files and update the dataset:

```sh
python3 audio-generation/audio_pipeline.py verify --voices Tamar Doron
python3 audio-generation/audio_pipeline.py apply --voices Tamar Doron
```

`apply` refuses to modify the dataset unless every expected file exists.
