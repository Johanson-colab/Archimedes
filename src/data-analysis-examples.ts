import penguins from "./assets/data-analysis/penguins.csv?raw";
import weather from "./assets/data-analysis/seattle-weather.csv?raw";
import type { PlotConfig } from "./data-analysis";

export type AnalysisExample = {
  id: string; title: string; file: string; csv: string; description: string; source: string; credit: string;
  presets: { label: string; explanation: string; config: PlotConfig }[];
};

export const analysisExamples: AnalysisExample[] = [
  {
    id: "penguins", title: "Palmer Penguins", file: "penguins.csv", csv: penguins,
    description: "344 penguins, 3 species, 8 fields. Explore body measurements, groups and missing values.",
    source: "https://allisonhorst.github.io/palmerpenguins/", credit: "Gorman, Williams & Fraser (2014); Horst, Hill & Gorman (2020). CC0.",
    presets: [
      { label: "Flipper length & body mass", explanation: "Compare flipper length (mm) and body mass (g), colored by species. Hover a point for its values. The correlation uses every valid pair.", config: { type: "scatter", x: 4, y: 5, group: 0 } },
      { label: "Mean body mass by species", explanation: "Each bar is the mean body mass (g) for one species, calculated from all non-missing measurements. Hover a bar to see the sample size.", config: { type: "bar", x: 0, y: 5, group: -1 } },
      { label: "Body mass distribution", explanation: "Each bin counts penguins in a body-mass interval. Missing measurements are excluded; this is a distribution, not one bar per penguin.", config: { type: "histogram", x: 5, y: 5, group: -1 } },
    ],
  },
  {
    id: "weather", title: "Seattle Weather", file: "seattle-weather.csv", csv: weather,
    description: "1,461 daily observations, 2012–2015. Explore seasonality, rainfall and temperature.",
    source: "https://github.com/vega/vega-datasets/blob/main/data/seattle-weather.csv", credit: "NOAA / Vega Datasets. U.S. government data; weather labels derived by Vega for teaching.",
    presets: [
      { label: "Temperature over four years", explanation: "Daily maximum temperature (°C), sorted by date. Follow the repeating seasonal pattern across all four years.", config: { type: "line", x: 0, y: 2, group: -1 } },
      { label: "Rainfall distribution", explanation: "Count days by precipitation (mm). The concentration near zero and the long tail demonstrate why a mean alone can be misleading.", config: { type: "histogram", x: 1, y: 1, group: -1 } },
      { label: "Wind & precipitation", explanation: "Compare wind (m/s) and precipitation (mm), colored by weather category. Weather categories are derived labels, not independent measurements.", config: { type: "scatter", x: 4, y: 1, group: 5 } },
    ],
  },
];
