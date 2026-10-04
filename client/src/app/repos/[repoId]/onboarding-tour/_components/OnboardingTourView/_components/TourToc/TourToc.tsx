import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

export interface TocItem {
  id: string;
  label: string;
}

/** "On this page" list. The active entry carries `aria-current`. */
export function TourToc({
  items,
  activeId,
  onSelect,
}: {
  items: TocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("onboardingSections");
  return (
    <nav aria-label={t("toc.navLabel")} style={s.nav}>
      <div style={s.title}>{t("toc.title")}</div>
      <ul style={s.list}>
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                style={s.link(active)}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(item.id);
                }}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
