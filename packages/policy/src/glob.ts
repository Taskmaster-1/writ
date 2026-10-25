const cache = new Map<string, RegExp>();

/** `*` matches any run of characters; everything else is literal. Case-sensitive. */
export function globMatch(pattern: string, value: string): boolean {
  let re = cache.get(pattern);
  if (!re) {
    const body = pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    re = new RegExp(`^${body}$`);
    cache.set(pattern, re);
  }
  return re.test(value);
}
