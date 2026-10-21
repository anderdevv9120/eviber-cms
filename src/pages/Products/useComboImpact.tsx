import { App, Button, Alert } from "antd";
import { Link, useNavigate } from "react-router";
import { listAffectedCombosAPI, type ComboRef } from "@/services/combos";
import { warningNotification } from "@/utils/notification";

export function useComboImpact() {
  const { modal } = App.useApp();
  const navigate = useNavigate();

  const confirm = async (productId: string, question: string): Promise<ComboRef[] | null> => {
    let affected: ComboRef[] = [];
    let lookupFailed = false;
    try {
      const { data } = await listAffectedCombosAPI(productId);
      affected = data.combos;
    } catch {
      lookupFailed = true;
    }
    return new Promise(resolve => {
      modal.confirm({
        title: question,
        content: lookupFailed ? (
          <Alert type='warning' showIcon title='Không kiểm tra được combo bị ảnh hưởng' />
        ) : affected.length ? (
          <div>
            <p>Combo bị ảnh hưởng:</p>
            <ul>
              {affected.map(combo => (
                <li key={combo._id}>
                  <Link to={`/combos/${encodeURIComponent(combo._id)}`}>{combo.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : undefined,
        okText: "Tiếp tục",
        cancelText: "Hủy",
        onOk: () => resolve(affected),
        onCancel: () => resolve(null)
      });
    });
  };

  const notify = (affected: ComboRef[]) => {
    if (!affected.length) return;
    warningNotification(`${affected.length} combo bị ảnh hưởng`, {
      actions: (
        <Button
          size='small'
          onClick={() =>
            navigate(
              affected.length === 1
                ? `/combos/${encodeURIComponent(affected[0]._id)}`
                : "/combos?attention=1"
            )
          }
        >
          Sửa combo
        </Button>
      )
    });
  };

  return { confirm, notify };
}
