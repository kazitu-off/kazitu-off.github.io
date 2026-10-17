export function roundRect(ctx, x, y, width, height, radius = 12) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}

export function paintRounded(ctx, x, y, width, height, radius, fill, shadow = "rgba(15, 23, 42, .24)") {
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
}

export function paintCircle(ctx, x, y, radius, fill, shadow = "rgba(15, 23, 42, .24)") {
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function loadSprite(src) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image;
}
