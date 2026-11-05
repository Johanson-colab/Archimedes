import { useState } from "react";
import { ChevronDown } from "lucide-react";
import DataChartGallery from "./DataChartGallery";
import { useUISettings } from "./i18n";

export default function DataChartsView({ active }: { active: boolean }) {
  const { t } = useUISettings();
  const [sort, setSort] = useState<"preferred" | "newest">("preferred");

  return <main className="image-creation-page data-chart-page" aria-label={t("Data charts")}>
    <header className="image-creation-tabs">
      <h2 className="image-creation-heading">{t("Data charts")}</h2>
      <div className="image-creation-actions">
        <label className="image-creation-sort">
          <select value={sort} onChange={(event) => setSort(event.target.value as "preferred" | "newest")} aria-label={t("Sort data charts")}>
            <option value="preferred">{t("Sort: AI venues first")}</option>
            <option value="newest">{t("Sort: Newest across all")}</option>
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>
      </div>
    </header>
    <DataChartGallery active={active} sort={sort} />
  </main>;
}
