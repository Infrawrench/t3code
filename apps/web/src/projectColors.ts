/**
 * Palette for per-project accessibility colors.
 *
 * Colors are persisted as palette names (not raw hex) so swatches resolve
 * through the theme's Tailwind color tokens and stay legible in both light
 * and dark appearances. The server treats the value as an opaque string, so
 * unknown values (from newer clients) simply render without a swatch here.
 */
export const PROJECT_COLOR_OPTIONS = [
  { name: "red", label: "Red" },
  { name: "orange", label: "Orange" },
  { name: "amber", label: "Amber" },
  { name: "green", label: "Green" },
  { name: "teal", label: "Teal" },
  { name: "sky", label: "Sky" },
  { name: "blue", label: "Blue" },
  { name: "violet", label: "Violet" },
  { name: "pink", label: "Pink" },
] as const;

export type ProjectColorName = (typeof PROJECT_COLOR_OPTIONS)[number]["name"];

const PROJECT_COLOR_NAMES = new Set<string>(PROJECT_COLOR_OPTIONS.map((option) => option.name));

export function isProjectColorName(value: string): value is ProjectColorName {
  return PROJECT_COLOR_NAMES.has(value);
}

/**
 * CSS color for a stored project color, or null when nothing should render
 * (no color set, or a value this client doesn't understand).
 */
export function projectColorCssValue(color: string | null | undefined): string | null {
  if (!color) {
    return null;
  }
  if (isProjectColorName(color)) {
    return `var(--color-${color}-500)`;
  }
  return /^#[0-9a-fA-F]{6}$/u.test(color) ? color : null;
}

/**
 * The color a grouped sidebar project should display: the representative's
 * own color when set, otherwise the first member that has one, so a color
 * chosen in any environment identifies the whole group.
 */
export function resolveProjectGroupColor(
  memberProjects: ReadonlyArray<{ readonly color?: string | null | undefined }>,
): string | null {
  for (const member of memberProjects) {
    if (member.color) {
      return member.color;
    }
  }
  return null;
}
