#!/usr/bin/env python3
"""
Crop every Chief of the Air Staff portrait to the same head-and-shoulders
framing, so the gallery, the Chief pages and the timeline cards line up.

For each chief in data/content.js it finds the face in `photo`, then cuts a
4:5 portrait in which the face is the same size and sits at the same height,
and writes it to assets/portraits/NN-short-name.jpg. The original photo is
left untouched (the timeline and the full-screen viewer still show the
whole archive scan, captions included).

Faces the detector gets wrong can be fixed by hand in OVERRIDES below:
the face box (x, y, w, h) in the original image's pixels.

Usage (needs Pillow and opencv-python-headless):
    python3 tools/crop-chief-portraits.py
Then add the printed `portrait` paths to data/content.js (already done for
the current set).
"""
import json
import os
import re
import subprocess
import sys

import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT_DIR = os.path.join(ROOT, 'assets', 'portraits')
OUT_W, OUT_H = 480, 600          # 4:5 portrait
FACE_W = 0.46                    # face width as a share of the portrait width
FACE_CY = 0.46                   # face centre as a share of the portrait height (room for caps above)

# Manual face boxes (x, y, w, h) in original pixels, by chief number,
# for portraits where the detector picks the wrong area or none.
OVERRIDES = {
    2: (75, 75, 130, 130),     # Thimmig: side profile, which the frontal detector misses
    11: (170, 175, 170, 170),  # Femi: tinted glasses under a peaked cap
    19: (115, 120, 125, 125),  # Amosu: flag behind confuses the detector
}

# The clean part of a photo, as fractions (left, top, right, bottom), for scans
# with a printed caption or a frame around them. The crop stays inside it.
BOUNDS = {
    1: (0, 0, 1, 0.93),          # caption along the bottom
    3: (0.05, 0.05, 0.95, 0.81), # white border and caption
    5: (0.03, 0.03, 0.97, 0.85), # border and caption
    21: (0.07, 0.07, 0.93, 0.78),  # framed certificate: border and printed name
    22: (0.05, 0.05, 0.95, 0.80),
    23: (0.06, 0.06, 0.94, 0.80),
}


def load_chiefs():
    js = subprocess.run(['node', '-e', "global.window={};require('./data/content.js');"
                         "process.stdout.write(JSON.stringify(window.HOF_CONTENT.chiefs))"],
                        cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(js)


def detect_face(path):
    img = cv2.imread(path)
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    h, w = gray.shape
    best = None
    for name in ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml', 'haarcascade_profileface.xml'):
        cascade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, name))
        for flip in (False, True):
            g = cv2.flip(gray, 1) if flip else gray
            faces = cascade.detectMultiScale(g, scaleFactor=1.05, minNeighbors=6, minSize=(max(40, w // 5), max(40, w // 5)))
            for (x, y, fw, fh) in faces:
                if flip:
                    x = w - x - fw
                if y + fh / 2 > h * 0.6:   # a face in the lower part is a badge or a printed name, not the sitter
                    continue
                if best is None or fw * fh > best[2] * best[3]:
                    best = (int(x), int(y), int(fw), int(fh))
        if best:
            return best
    return None


def crop(path, face, bounds=(0, 0, 1, 1)):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    bx0, by0, bx1, by1 = bounds[0] * W, bounds[1] * H, bounds[2] * W, bounds[3] * H
    x, y, fw, fh = face
    cw = fw / FACE_W
    ch = cw * OUT_H / OUT_W
    # Never ask for more than the clean area holds: shrink the crop (the face gets a little larger) instead of padding.
    scale = min(1.0, (bx1 - bx0) / cw, (by1 - by0) / ch)
    cw, ch = cw * scale, ch * scale
    cx, cy = x + fw / 2, y + fh / 2
    left = min(max(bx0, cx - cw / 2), bx1 - cw)
    top = min(max(by0, cy - ch * FACE_CY), by1 - ch)
    box = tuple(int(round(v)) for v in (left, top, left + cw, top + ch))
    return im.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS), box


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    report = []
    for c in load_chiefs():
        src = os.path.join(ROOT, c['photo'])
        face = OVERRIDES.get(c['no']) or detect_face(src)
        if not face:
            print('no face found for', c['no'], c['name'], '- add an OVERRIDES entry', file=sys.stderr)
            continue
        out, box = crop(src, face, BOUNDS.get(c['no'], (0, 0, 1, 1)))
        name = '%02d-%s.jpg' % (c['no'], slug(c['shortName']))
        out.save(os.path.join(OUT_DIR, name), quality=90)
        report.append({'no': c['no'], 'face': face, 'box': box, 'portrait': 'assets/portraits/' + name})
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
