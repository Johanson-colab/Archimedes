import { createPortal } from "react-dom";

export default function DialogPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
