# Your memories

1. Add your JPG, PNG, or WebP photos to this folder. Use short filenames without spaces.
2. Open [photos.js](../../photos.js). Each numbered slot contains a filename (`src`) and a caption.
3. Fill the slots in the order you want. Keep the ids 1–15; swap the filenames and captions to reorder photos.

Example:

```js
{ id: 1, src: "assets/memories/beach.jpg", caption: "Our beach day" },
```

Keep captions short (about 25 characters). Photos are cropped to a nearly square frame; keep faces near the centre. Aim for images around 1000 pixels wide and under 500 KB for quick mobile loading. Empty or missing images keep the illustrated placeholder. Slots 6 and 11 are obstacle frames. Parallax can briefly show neighbouring memories together.

Commit and push to `main` to update the live game. This repository and its photos are public.

The same photos and captions appear automatically in the celebration gallery after the game. The gallery shows the full image without cropping.
