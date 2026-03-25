import Link from "next/link";

type Props = {
  /** Bijv. "Reports" */
  parentLabel: string;
  parentHref: string;
  /** Huidige paginatitel */
  currentTitle: string;
  /** Optioneel tweede segment (bijv. tab-naam) */
  extraCrumb?: string;
};

/**
 * Contextuele navigatie: snel terug naar de lijst + breadcrumb.
 */
export function SubNavBar({ parentLabel, parentHref, currentTitle, extraCrumb }: Props) {
  return (
    <nav
      aria-label="Pagina-navigatie"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400"
    >
      <Link
        href={parentHref}
        className="font-medium text-[#1DB954] hover:underline dark:text-[#1ed760]"
      >
        ← {parentLabel}
      </Link>
      <span className="text-zinc-400" aria-hidden>
        /
      </span>
      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100" title={currentTitle}>
        {currentTitle}
      </span>
      {extraCrumb ? (
        <>
          <span className="text-zinc-400" aria-hidden>
            /
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">{extraCrumb}</span>
        </>
      ) : null}
    </nav>
  );
}
