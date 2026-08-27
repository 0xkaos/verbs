#!/usr/bin/env python3
"""Prepare, build, apply, and verify deterministic Narakeet audio assets."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable


SITE = Path(__file__).resolve().parent.parent
DATASET = SITE / "verbs.canonical.json"
GENERATED = Path(__file__).resolve().parent / "generated"
AUDIO_ROOT = SITE / "audio-v2"
API_ENDPOINT = "https://api.narakeet.com/text-to-speech/mp3"
DEFAULT_BATCH_SIZE = 450
KINDS = ("conjugations", "examples", "details")


@dataclass(frozen=True)
class Clip:
    kind: str
    verb_key: str
    binyan: str
    tense: str
    row: int
    pronoun: str
    text: str
    relative_path: PurePosixPath


def load_dataset() -> dict:
    with DATASET.open(encoding="utf-8") as handle:
        return json.load(handle)


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.replace("’", "-").replace("'", "-")
    result = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    if not result:
        raise ValueError(f"cannot create a safe path from {value!r}")
    return result


def spoken_text(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


def records(dataset: dict) -> list[Clip]:
    clips: list[Clip] = []
    paths: set[PurePosixPath] = set()
    for verb_key, verb in dataset.items():
        verb_slug = slug(verb_key)
        for tense, forms in verb.get("conjugations", {}).items():
            for row_index, form in enumerate(forms, start=1):
                form_text = spoken_text(form.get("form", ""))
                if not form_text:
                    raise ValueError(f"empty form: {verb_key}/{tense}/{row_index}")
                form_path = PurePosixPath(
                    "conjugations", verb_slug, f"{tense}-{row_index:02d}.mp3"
                )
                clips.append(Clip(
                    "conjugations", verb_key, verb.get("binyan_en", ""), tense,
                    row_index, form.get("pronoun", ""), form_text, form_path,
                ))
                sentence = spoken_text(form.get("example_sentence_he", ""))
                if sentence:
                    example_path = PurePosixPath(
                        "examples", verb_slug, f"{tense}-{row_index:02d}.mp3"
                    )
                    clips.append(Clip(
                        "examples", verb_key, verb.get("binyan_en", ""), tense,
                        row_index, form.get("pronoun", ""), sentence, example_path,
                    ))
        for example_index, example in enumerate(verb.get("examples", []), start=1):
            sentence = spoken_text(example.get("hebrew", ""))
            if not sentence:
                continue
            detail_path = PurePosixPath(
                "details", verb_slug, f"example-{example_index:02d}.mp3"
            )
            clips.append(Clip(
                "details", verb_key, verb.get("binyan_en", ""), "details",
                example_index, "", sentence, detail_path,
            ))
    for clip in clips:
        if clip.relative_path in paths:
            raise ValueError(f"duplicate output path: {clip.relative_path}")
        paths.add(clip.relative_path)
    return clips


def grouped(clips: Iterable[Clip]) -> dict[str, list[Clip]]:
    result = {kind: [] for kind in KINDS}
    for clip in clips:
        result[clip.kind].append(clip)
    return result


def batches(items: list[Clip], size: int) -> Iterable[tuple[int, list[Clip]]]:
    for offset in range(0, len(items), size):
        yield offset // size + 1, items[offset:offset + size]


def scene_script(items: list[Clip]) -> str:
    return "\n\n---\n\n".join(item.text for item in items) + "\n"


def prepare(batch_size: int) -> dict[str, int]:
    by_kind = grouped(records(load_dataset()))
    lists_dir = GENERATED / "lists"
    batches_dir = GENERATED / "batches"
    if GENERATED.exists():
        shutil.rmtree(GENERATED)
    lists_dir.mkdir(parents=True)
    batches_dir.mkdir(parents=True)

    counts: dict[str, int] = {}
    for kind, items in by_kind.items():
        counts[kind] = len(items)
        list_name = {
            "conjugations": "conjugations.txt",
            "examples": "example-sentences.txt",
            "details": "detail-examples.txt",
        }[kind]
        (lists_dir / list_name).write_text(
            "\n".join(item.text for item in items) + "\n", encoding="utf-8"
        )
        with (lists_dir / f"{kind}.tsv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
            writer.writerow([
                "sequence", "batch", "scene", "relative_path", "verb_key",
                "binyan", "tense", "row", "pronoun", "text",
            ])
            sequence = 0
            for batch_number, batch in batches(items, batch_size):
                batch_path = batches_dir / f"{kind}-{batch_number:03d}.txt"
                batch_path.write_text(scene_script(batch), encoding="utf-8")
                for scene_number, item in enumerate(batch, start=1):
                    sequence += 1
                    writer.writerow([
                        sequence, batch_number, scene_number,
                        item.relative_path.as_posix(), item.verb_key, item.binyan,
                        item.tense, item.row, item.pronoun, item.text,
                    ])
    metadata = {
        "dataset": DATASET.name,
        "batch_size": batch_size,
        "counts": counts,
        "voices": ["Tamar", "Doron"],
        "format": "mp3",
    }
    (GENERATED / "manifest.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return counts


def request_json(request: urllib.request.Request, attempts: int = 4) -> dict:
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", "replace")
            if error.code < 500 and error.code != 429:
                raise RuntimeError(f"Narakeet API error {error.code}: {body}") from error
            if attempt == attempts:
                raise RuntimeError(f"Narakeet API error {error.code}: {body}") from error
        except urllib.error.URLError:
            if attempt == attempts:
                raise
        time.sleep(attempt * 5)
    raise AssertionError("unreachable")


def start_batch(api_key: str, voice: str, script: str) -> str:
    url = API_ENDPOINT + "?" + urllib.parse.urlencode({"voice": voice})
    request = urllib.request.Request(
        url,
        data=script.encode("utf-8"),
        method="POST",
        headers={
            "Accept": "application/zip",
            "Content-Type": "text/plain; charset=utf-8",
            "x-api-key": api_key,
            "User-Agent": "Alephbetical-audio-pipeline/1.0",
        },
    )
    response = request_json(request)
    status_url = response.get("statusUrl")
    if not status_url:
        raise RuntimeError("Narakeet did not return a status URL")
    return status_url


def wait_for_batch(status_url: str) -> dict:
    while True:
        time.sleep(5)
        request = urllib.request.Request(
            status_url, headers={"User-Agent": "Alephbetical-audio-pipeline/1.0"}
        )
        status = request_json(request)
        if status.get("finished"):
            if not status.get("succeeded"):
                raise RuntimeError(status.get("message", "Narakeet batch failed"))
            if not status.get("zip"):
                raise RuntimeError("Narakeet batch completed without a ZIP URL")
            return status


def download(url: str) -> bytes:
    request = urllib.request.Request(
        url, headers={"User-Agent": "Alephbetical-audio-pipeline/1.0"}
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def install_zip(archive: bytes, items: list[Clip], voice: str) -> None:
    voice_root = AUDIO_ROOT / slug(voice)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        members = {
            Path(info.filename).name: info
            for info in bundle.infolist()
            if not info.is_dir()
        }
        expected = [f"{index:04d}.mp3" for index in range(1, len(items) + 1)]
        if set(members) != set(expected):
            raise RuntimeError(
                f"batch ZIP mismatch: expected {len(expected)} numbered MP3 files, "
                f"received {len(members)}"
            )
        with tempfile.TemporaryDirectory(prefix="alephbetical-audio-") as temp_name:
            temp = Path(temp_name)
            staged: list[tuple[Path, Path]] = []
            for member_name, item in zip(expected, items):
                payload = bundle.read(members[member_name])
                if len(payload) < 1000:
                    raise RuntimeError(f"suspiciously small MP3: {member_name}")
                staged_path = temp / member_name
                staged_path.write_bytes(payload)
                target = voice_root / Path(item.relative_path)
                staged.append((staged_path, target))
            for staged_path, target in staged:
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary_target = target.with_name(f".{target.name}.tmp")
                shutil.copyfile(staged_path, temporary_target)
                temporary_target.replace(target)


def build(voices: list[str], kinds: list[str], batch_size: int, force: bool) -> None:
    api_key = os.environ.get("NARAKEET_API_KEY")
    if not api_key:
        raise RuntimeError("set NARAKEET_API_KEY in the environment")
    by_kind = grouped(records(load_dataset()))
    prepare(batch_size)
    total_duration = 0
    for voice in voices:
        for kind in kinds:
            items = by_kind[kind]
            if force:
                pending = items
            else:
                pending = [
                    item for item in items
                    if not (
                        (AUDIO_ROOT / slug(voice) / Path(item.relative_path)).is_file()
                        and (AUDIO_ROOT / slug(voice) / Path(item.relative_path)).stat().st_size > 1000
                    )
                ]
            all_batches = list(batches(pending, batch_size))
            if not all_batches:
                print(f"[{voice}] {kind} already complete", flush=True)
                continue
            for batch_number, batch in all_batches:
                print(
                    f"[{voice}] building {kind} {batch_number}/{len(all_batches)} "
                    f"({len(batch)} scenes)", flush=True,
                )
                status_url = start_batch(api_key, voice, scene_script(batch))
                status = wait_for_batch(status_url)
                install_zip(download(status["zip"]), batch, voice)
                duration = int(status.get("durationInSeconds", 0))
                total_duration += duration
                print(
                    f"[{voice}] installed {kind} {batch_number}/{len(all_batches)} "
                    f"({duration} credit-seconds)", flush=True,
                )
    print(f"Build complete; this run generated {total_duration} credit-seconds", flush=True)


def voice_paths(relative_path: PurePosixPath, voices: list[str]) -> dict[str, str]:
    return {
        voice: PurePosixPath("audio-v2", slug(voice), relative_path).as_posix()
        for voice in voices
    }


def apply(voices: list[str]) -> None:
    dataset = load_dataset()
    clips = records(dataset)
    by_location = {
        (clip.kind, clip.verb_key, clip.tense, clip.row): clip for clip in clips
    }
    missing = []
    for clip in clips:
        for voice, path in voice_paths(clip.relative_path, voices).items():
            target = SITE / path
            if not target.is_file() or target.stat().st_size <= 1000:
                missing.append((voice, path))
    if missing:
        sample = ", ".join(f"{voice}:{path}" for voice, path in missing[:5])
        raise RuntimeError(f"cannot apply: {len(missing)} audio files missing; {sample}")

    for verb_key, verb in dataset.items():
        for tense, forms in verb.get("conjugations", {}).items():
            for row_index, form in enumerate(forms, start=1):
                form_clip = by_location[("conjugations", verb_key, tense, row_index)]
                form["audio"] = voice_paths(form_clip.relative_path, voices)
                example_clip = by_location.get(("examples", verb_key, tense, row_index))
                if example_clip:
                    form["audio_example"] = voice_paths(example_clip.relative_path, voices)
                else:
                    form.pop("audio_example", None)
        for example_index, example in enumerate(verb.get("examples", []), start=1):
            detail_clip = by_location.get(("details", verb_key, "details", example_index))
            if detail_clip:
                example["audio"] = voice_paths(detail_clip.relative_path, voices)
            else:
                example.pop("audio", None)
    DATASET.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Updated {DATASET.name} with {len(voices)} voices", flush=True)


def verify(voices: list[str]) -> None:
    clips = records(load_dataset())
    missing = []
    for clip in clips:
        for voice, path in voice_paths(clip.relative_path, voices).items():
            target = SITE / path
            if not target.is_file() or target.stat().st_size <= 1000:
                missing.append(path)
    expected = len(clips) * len(voices)
    if missing:
        raise RuntimeError(f"{len(missing)} of {expected} expected files are missing")
    print(f"Verified {expected} audio files for {len(voices)} voices", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare", help="write lists, TSV manifests, and batch scripts")
    prepare_parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    build_parser = subparsers.add_parser("build", help="build and install Narakeet batch audio")
    build_parser.add_argument("--voices", nargs="+", default=["Tamar", "Doron"])
    build_parser.add_argument("--kinds", nargs="+", choices=KINDS, default=list(KINDS))
    build_parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    build_parser.add_argument("--force", action="store_true")
    apply_parser = subparsers.add_parser("apply", help="replace dataset audio references after a complete build")
    apply_parser.add_argument("--voices", nargs="+", default=["Tamar", "Doron"])
    verify_parser = subparsers.add_parser("verify", help="verify all expected audio files exist")
    verify_parser.add_argument("--voices", nargs="+", default=["Tamar", "Doron"])
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "prepare":
        counts = prepare(args.batch_size)
        print(json.dumps(counts, ensure_ascii=False), flush=True)
    elif args.command == "build":
        build(args.voices, args.kinds, args.batch_size, args.force)
    elif args.command == "apply":
        apply(args.voices)
    elif args.command == "verify":
        verify(args.voices)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
