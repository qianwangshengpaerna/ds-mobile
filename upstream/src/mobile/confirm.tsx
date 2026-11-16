import { create } from "zustand";
import { Modal } from "../components/base/Modal.js";
type Confirmation = { message: string; finish: ((accepted: boolean) => void) | null };
const useConfirmation = create<Confirmation>(() => ({ message: "", finish: null }));
export const confirmAction = (message: string): Promise<boolean> =>
  new Promise((resolve) => {
    useConfirmation.getState().finish?.(false);
    useConfirmation.setState({ message, finish: resolve });
  });
export function ActionConfirm() {
  const { message, finish } = useConfirmation();
  if (!finish) {
    return null;
  }
  const settle = (value: boolean) => {
    useConfirmation.setState({ message: "", finish: null });
    finish(value);
  };
  return (
    <Modal
      title="请确认"
      onClose={() => settle(false)}
      footer={
        <>
          <button className="ds-outline" onClick={() => settle(false)}>
            取消
          </button>
          <button className="ds-primary" onClick={() => settle(true)}>
            确定
          </button>
        </>
      }
    >
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{message}</p>
    </Modal>
  );
}
