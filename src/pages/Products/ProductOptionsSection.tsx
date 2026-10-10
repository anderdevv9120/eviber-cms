import { Alert, Button, Card, Checkbox, Flex, Select, Tooltip, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import type { useAttributeCatalog } from "./useAttributeCatalog";

export interface OptionState {
  attributeId: string;
  attributeName: string;
  valueIds: string[];
}
export interface ValueOption {
  _id: string;
  value: string;
}

const MAX_OPTIONS = 5; // backend ProductAdminWriteDto bound
/** Saved product order first, newly ticked values after them in dictionary order. */
const orderValueIds = (
  ticked: Set<string>,
  savedOrder: string[],
  dictionary: ValueOption[]
): string[] => [
  ...savedOrder.filter(id => ticked.has(id)),
  ...dictionary.map(value => value._id).filter(id => ticked.has(id) && !savedOrder.includes(id))
];

interface Props {
  options: OptionState[];
  savedOrder: Record<string, string[]>;
  /** Values the product already lists (labels for ones the dictionary no longer returns). */
  productValues: Record<string, ValueOption[]>;
  catalog: ReturnType<typeof useAttributeCatalog>;
  locked: Set<string>;
  hasSavedVariants: boolean;
  disabled: boolean;
  onChange: (options: OptionState[]) => void;
}

export default function ProductOptionsSection({
  options,
  savedOrder,
  productValues,
  catalog,
  locked,
  hasSavedVariants,
  disabled,
  onChange
}: Props) {
  const used = new Set(options.map(option => option.attributeId));
  const addable = catalog.attributes.filter(attribute => !used.has(attribute._id));
  const add = (attributeId: string) => {
    const attribute = catalog.attributes.find(row => row._id === attributeId);
    if (attribute)
      onChange([...options, { attributeId, attributeName: attribute.name, valueIds: [] }]);
  };
  const toggle = (option: OptionState, dictionary: ValueOption[], id: string, on: boolean) => {
    const ticked = new Set(option.valueIds);
    if (on) ticked.add(id);
    else ticked.delete(id);
    const valueIds = orderValueIds(ticked, savedOrder[option.attributeId] ?? [], dictionary);
    onChange(options.map(row => (row === option ? { ...row, valueIds } : row)));
  };
  // Adding an option changes every combination, and saved combinations are immutable
  const addBlocked = hasSavedVariants || options.length >= MAX_OPTIONS;
  return (
    <Card title='Tùy chọn'>
      <Flex vertical gap={16}>
        {catalog.error && <Alert type='error' showIcon title={catalog.error} />}
        {options.map(option => {
          const loaded = catalog.values[option.attributeId];
          const known = productValues[option.attributeId] ?? [];
          const dictionary: ValueOption[] = loaded
            ? [...loaded, ...known.filter(value => !loaded.some(row => row._id === value._id))]
            : known;
          const hasLocked = option.valueIds.some(id => locked.has(id));
          return (
            <Flex key={option.attributeId} vertical gap={8}>
              <Flex align='center' gap={8}>
                <Typography.Text strong>{option.attributeName}</Typography.Text>
                <Button
                  size='small'
                  aria-label={`Bỏ thuộc tính ${option.attributeName}`}
                  disabled={disabled || hasLocked}
                  onClick={() => onChange(options.filter(row => row !== option))}
                >
                  Bỏ
                </Button>
              </Flex>
              <Flex wrap gap={12}>
                {dictionary.map(value => {
                  const isLocked = locked.has(value._id);
                  return (
                    <Checkbox
                      key={value._id}
                      checked={option.valueIds.includes(value._id)}
                      disabled={disabled || isLocked}
                      onChange={event =>
                        toggle(option, dictionary, value._id, event.target.checked)
                      }
                    >
                      {value.value}
                      {isLocked && (
                        <Tooltip title='Đang dùng cho biến thể đã lưu'>
                          <LockOutlined className='ml-1' aria-hidden />
                        </Tooltip>
                      )}
                    </Checkbox>
                  );
                })}
              </Flex>
            </Flex>
          );
        })}
        <Select
          aria-label='Thêm thuộc tính'
          placeholder={
            hasSavedVariants ? "Không thể thêm thuộc tính khi đã có biến thể" : "Thêm thuộc tính"
          }
          value={null}
          disabled={disabled || addBlocked}
          style={{ maxWidth: 320 }}
          options={addable.map(({ _id, name }) => ({ value: _id, label: name }))}
          onChange={add}
        />
      </Flex>
    </Card>
  );
}
