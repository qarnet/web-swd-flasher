export const FILE_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"
];

export function mergeHexFiles(files) {
  // files: [{name, parsed}]
  const combined = new Map(); // addr -> {value, fileIdx}
  const conflicts = [];

  for (let i = 0; i < files.length; i++) {
    for (const [addr, value] of files[i].parsed.data) {
      const prev = combined.get(addr);
      if (prev !== undefined) {
        if (prev.value !== value) {
          conflicts.push({
            addr,
            fileA: files[prev.fileIdx].name,
            fileB: files[i].name,
            valueA: prev.value,
            valueB: value
          });
        }
        // first file wins on conflict
      } else {
        combined.set(addr, { value, fileIdx: i });
      }
    }
  }

  if (combined.size === 0) return { conflicts, merged: null };

  const sortedAddrs = [...combined.keys()].sort((a, b) => a - b);
  const data = new Map(sortedAddrs.map((a) => [a, combined.get(a).value]));

  return {
    conflicts,
    merged: {
      format: "intel-hex-merged",
      byteCount: data.size,
      minAddress: sortedAddrs[0],
      maxAddress: sortedAddrs[sortedAddrs.length - 1],
      data,
      addresses: sortedAddrs
    }
  };
}
