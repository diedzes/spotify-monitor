type Props = {
  url: string;
  title: string | null;
  image: string | null;
  siteName: string | null;
  compact?: boolean;
};

export function EvidenceLinkPreview({ url, title, image, siteName, compact = false }: Props) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex overflow-hidden rounded-lg border border-zinc-200 bg-white text-left transition hover:border-emerald-400 dark:border-zinc-600 dark:bg-zinc-900 ${compact ? "max-w-md" : ""}`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-24 w-24 shrink-0 object-cover sm:h-28 sm:w-28" />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-zinc-100 text-[10px] text-zinc-500 sm:h-28 sm:w-28 dark:bg-zinc-800">
          Link
        </div>
      )}
      <div className="min-w-0 flex-1 p-3">
        <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{title || siteName || url}</p>
        {siteName ? <p className="mt-1 text-xs text-zinc-500">{siteName}</p> : null}
        <p className="mt-1 truncate text-xs text-emerald-600">{url}</p>
      </div>
    </a>
  );
}
