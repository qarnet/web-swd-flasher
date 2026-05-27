function toSegments(addresses) {
  const segments = [];
  if (addresses.length === 0) {
    return segments;
  }

  let start = addresses[0];
  let end = addresses[0];

  for (let i = 1; i < addresses.length; i += 1) {
    const current = addresses[i];
    if (current === end + 1) {
      end = current;
      continue;
    }
    segments.push({ start, end, length: end - start + 1 });
    start = current;
    end = current;
  }

  segments.push({ start, end, length: end - start + 1 });
  return segments;
}

export function buildImageMap(parsedImage) {
  const segments = toSegments(parsedImage.addresses);
  return {
    byteCount: parsedImage.byteCount,
    minAddress: parsedImage.minAddress,
    maxAddress: parsedImage.maxAddress,
    segments
  };
}

export function formatImageMap(imageMap) {
  const lines = [];
  lines.push(`Bytes: ${imageMap.byteCount}`);
  lines.push(
    `Range: 0x${imageMap.minAddress.toString(16).padStart(8, "0")} - 0x${imageMap.maxAddress.toString(16).padStart(8, "0")}`
  );
  lines.push(`Segments: ${imageMap.segments.length}`);
  for (const segment of imageMap.segments) {
    lines.push(
      `  0x${segment.start.toString(16).padStart(8, "0")} - 0x${segment.end.toString(16).padStart(8, "0")} (${segment.length} B)`
    );
  }
  return lines.join("\n");
}
