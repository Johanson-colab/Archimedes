import autoErrorDiscovery from "./assets/gallery-supplements/emnlp/auto-error-discovery.png";
import inferAct from "./assets/gallery-supplements/emnlp/inferact.png";
import interpretFeatures from "./assets/gallery-supplements/iccv/interpret-features.png";
import longLrm from "./assets/gallery-supplements/iccv/long-lrm.png";
import only from "./assets/gallery-supplements/iccv/only.png";
import longVlm from "./assets/gallery-supplements/eccv/longvlm.png";
import moai from "./assets/gallery-supplements/eccv/moai.png";
import stLlm from "./assets/gallery-supplements/eccv/st-llm.png";

export type GallerySupplement = {
  id: string;
  venue: "iccv" | "eccv" | "emnlp";
  year: number;
  title: string;
  authors: string[];
  pattern: "conceptual" | "framework" | "pipeline" | "architecture" | "results" | "comparison";
  image: string;
  paper: string;
  source: "official-proceedings";
};

// These crops come from the linked, openly accessible official paper PDFs.
// Keep this compact seed set reviewed by hand; it is intentionally separate
// from the upstream curated catalogue so provenance remains visible in the UI.
export const GALLERY_SUPPLEMENTS: GallerySupplement[] = [
  {
    id: "archimedes-iccv-2025-long-lrm", venue: "iccv", year: 2025,
    title: "Long-LRM: Long-sequence Large Reconstruction Model for Wide-coverage Gaussian Splats",
    authors: ["Chen Ziwen", "Hao Tan", "Kai Zhang", "Sai Bi", "Fujun Luan", "Yicong Hong", "Li Fuxin", "Zexiang Xu"],
    pattern: "framework", image: longLrm,
    paper: "https://openaccess.thecvf.com/content/ICCV2025/html/Ziwen_Long-LRM_Long-sequence_Large_Reconstruction_Model_for_Wide-coverage_Gaussian_Splats_ICCV_2025_paper.html",
    source: "official-proceedings",
  },
  {
    id: "archimedes-iccv-2025-interpret-features", venue: "iccv", year: 2025,
    title: "Large Multi-modal Models Can Interpret Features in Large Multi-modal Models",
    authors: ["Kaichen Zhang", "Yifei Shen", "Bo Li", "Ziwei Liu"],
    pattern: "architecture", image: interpretFeatures,
    paper: "https://openaccess.thecvf.com/content/ICCV2025/html/Zhang_Large_Multi-modal_Models_Can_Interpret_Features_in_Large_Multi-modal_Models_ICCV_2025_paper.html",
    source: "official-proceedings",
  },
  {
    id: "archimedes-iccv-2025-only", venue: "iccv", year: 2025,
    title: "ONLY: One-Layer Intervention Sufficiently Mitigates Hallucinations in Large Vision-Language Models",
    authors: ["Zifu Wan", "Ce Zhang", "Silong Yong", "Martin Q. Ma", "Simon Stepputtis", "Louis-Philippe Morency", "Deva Ramanan", "Katia Sycara", "Yaqi Xie"],
    pattern: "results", image: only,
    paper: "https://openaccess.thecvf.com/content/ICCV2025/html/Wan_ONLY_One-Layer_Intervention_Sufficiently_Mitigates_Hallucinations_in_Large_Vision-Language_Models_ICCV_2025_paper.html",
    source: "official-proceedings",
  },
  {
    id: "archimedes-eccv-2024-st-llm", venue: "eccv", year: 2024,
    title: "ST-LLM: Large Language Models Are Effective Temporal Learners",
    authors: ["Ruyang Liu", "Chen Li", "Haoran Tang", "Yixiao Ge", "Ying Shan", "Ge Li"],
    pattern: "comparison", image: stLlm,
    paper: "https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/7364_ECCV_2024_paper.php",
    source: "official-proceedings",
  },
  {
    id: "archimedes-eccv-2024-longvlm", venue: "eccv", year: 2024,
    title: "LongVLM: Efficient Long Video Understanding via Large Language Models",
    authors: ["Yuetian Weng", "Mingfei Han", "Haoyu He", "Xiaojun Chang", "Bohan Zhuang"],
    pattern: "architecture", image: longVlm,
    paper: "https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/4936_ECCV_2024_paper.php",
    source: "official-proceedings",
  },
  {
    id: "archimedes-eccv-2024-moai", venue: "eccv", year: 2024,
    title: "MoAI: Mixture of All Intelligence for Large Language and Vision Models",
    authors: ["Byung-Kwan Lee", "Beomchan Park", "Chae Won Kim", "Yong Man Ro"],
    pattern: "results", image: moai,
    paper: "https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/6579_ECCV_2024_paper.php",
    source: "official-proceedings",
  },
  {
    id: "archimedes-emnlp-2025-auto-error-discovery", venue: "emnlp", year: 2025,
    title: "Towards Automated Error Discovery: A Study in Conversational AI",
    authors: ["Dominic Petrak", "Thy Thy Tran", "Iryna Gurevych"],
    pattern: "pipeline", image: autoErrorDiscovery,
    paper: "https://aclanthology.org/2025.emnlp-main.1/",
    source: "official-proceedings",
  },
  {
    id: "archimedes-emnlp-2025-inferact", venue: "emnlp", year: 2025,
    title: "Preemptive Detection and Correction of Misaligned Actions in LLM Agents",
    authors: ["Haishuo Fang", "Xiaodan Zhu", "Iryna Gurevych"],
    pattern: "conceptual", image: inferAct,
    paper: "https://aclanthology.org/2025.emnlp-main.12/",
    source: "official-proceedings",
  },
];
