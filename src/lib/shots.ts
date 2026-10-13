import type { ImageMetadata } from "astro";
import crisurDesktop from "@/assets/projects/crisur-desktop.png";
import crisurMobile from "@/assets/projects/crisur-mobile.png";
import vegatechDesktop from "@/assets/projects/vegatech-desktop.png";
import vegatechMobile from "@/assets/projects/vegatech-mobile.png";

/** Desktop (1440 × 900) and phone (390 × 844) screenshot of a project. */
export interface ProjectShots {
  desktop: ImageMetadata;
  mobile: ImageMetadata;
}

/**
 * Screenshots by project id (`projects.yaml`). Static imports: if a file is missing or renamed,
 * the build fails naming the path (R22.9). The guard in lib/content.ts fails when a project has no entry.
 */
export const SHOTS: Record<string, ProjectShots> = {
  vegatech: { desktop: vegatechDesktop, mobile: vegatechMobile },
  crisur: { desktop: crisurDesktop, mobile: crisurMobile },
};
