import { App, Button, Alert } from "antd";
import { Link, useNavigate } from "react-router";
import { PATH } from "@/constants/paths";
import { listAffectedCombosAPI, type ComboRef } from "@/services/combos";
import { warningNotification } from "@/utils/notification";
import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";

export function useComboImpact() {
  const { modal } = App.useApp();
  const navigate = useNavigate();
  const profile = useAppStore(state => state.profile);
  const canReadCombos = !!profile && canAccess(profile, { anyOf: ["COMBO_READ"] });

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
                  {canReadCombos ? (
                    <Link to={PATH.COMBO_DETAIL.replace(":id", encodeURIComponent(combo._id))}>
                      {combo.name}
                    </Link>
                  ) : (
                    combo.name
                  )}
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
    const current = useAppStore.getState().profile;
    const canOpen = !!current && canAccess(current, { anyOf: ["COMBO_READ"] });
    warningNotification(`${affected.length} combo bị ảnh hưởng`, {
      actions: canOpen ? (
        <Button
          size='small'
          onClick={() =>
            navigate(
              affected.length === 1
                ? PATH.COMBO_DETAIL.replace(":id", encodeURIComponent(affected[0]._id))
                : `${PATH.COMBOS}?attention=1`
            )
          }
        >
          Sửa combo
        </Button>
      ) : undefined
    });
  };

  return { confirm, notify };
}
