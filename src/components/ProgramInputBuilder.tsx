import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import type {
  ProgramInputBaseId,
  ProgramInputItem,
} from '../types/byteplay';

interface ProgramInputBuilderProps {
  inputs: ProgramInputItem[];
  onInputsChange: (inputs: ProgramInputItem[]) => void;
}

type InputBase = {
  id: ProgramInputBaseId;
  label: string;
  placeholder: string;
  inputType: 'text' | 'number' | 'select';
  hint: string;
};

const INPUT_BASES: InputBase[] = [
  {
    id: 'text',
    label: 'Text',
    placeholder: 'hello world',
    inputType: 'text',
    hint: 'Sends one text line to stdin.',
  },
  {
    id: 'integer',
    label: 'Integer',
    placeholder: '42',
    inputType: 'number',
    hint: 'Whole numbers only.',
  },
  {
    id: 'decimal',
    label: 'Decimal',
    placeholder: '3.14',
    inputType: 'number',
    hint: 'Any finite decimal number.',
  },
  {
    id: 'character',
    label: 'Character',
    placeholder: 'A',
    inputType: 'text',
    hint: 'Exactly one character.',
  },
  {
    id: 'boolean',
    label: 'Boolean',
    placeholder: '1',
    inputType: 'select',
    hint: 'Sends 1 or 0.',
  },
];

const createInputId = (): string =>
  `stdin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getInputBase = (
  baseId: ProgramInputBaseId,
): InputBase =>
  INPUT_BASES.find((base) => base.id === baseId) ??
  INPUT_BASES[0];

const validateInput = (
  baseId: ProgramInputBaseId,
  value: string,
): string => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return 'Enter a value before adding input.';
  }

  if (
    baseId === 'integer' &&
    !/^-?\d+$/.test(normalizedValue)
  ) {
    return 'Integer input must be a whole number.';
  }

  if (
    baseId === 'decimal' &&
    !Number.isFinite(Number(normalizedValue))
  ) {
    return 'Decimal input must be a valid number.';
  }

  if (
    baseId === 'character' &&
    Array.from(normalizedValue).length !== 1
  ) {
    return 'Character input must contain exactly one character.';
  }

  if (
    baseId === 'boolean' &&
    normalizedValue !== '1' &&
    normalizedValue !== '0'
  ) {
    return 'Boolean input must be 1 or 0.';
  }

  return '';
};

export const ProgramInputBuilder: FC<
  ProgramInputBuilderProps
> = ({ inputs, onInputsChange }) => {
  const [selectedBaseId, setSelectedBaseId] =
    useState<ProgramInputBaseId>('text');
  const [baseQuery, setBaseQuery] = useState('');
  const [isBaseMenuOpen, setIsBaseMenuOpen] = useState(false);
  const [value, setValue] = useState('');
  const [editingInputId, setEditingInputId] =
    useState<string | null>(null);
  const [validationMessage, setValidationMessage] =
    useState('');

  const valueInputRef = useRef<
    HTMLInputElement | HTMLSelectElement | null
  >(null);

  const baseMenuRef =
    useRef<HTMLDivElement | null>(null);

  const selectedBase = getInputBase(selectedBaseId);

  const filteredBases = useMemo(() => {
    const query = baseQuery.trim().toLowerCase();

    if (!query) {
      return INPUT_BASES;
    }

    return INPUT_BASES.filter((base) =>
      base.label.toLowerCase().includes(query),
    );
  }, [baseQuery]);

  useEffect(() => {
    const handleOutsideClick = (
      event: globalThis.MouseEvent,
    ): void => {
      if (
        baseMenuRef.current &&
        !baseMenuRef.current.contains(
          event.target as Node,
        )
      ) {
        setIsBaseMenuOpen(false);
        setBaseQuery('');
      }
    };

    document.addEventListener(
      'mousedown',
      handleOutsideClick,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick,
      );
    };
  }, []);

  const focusValueInput = (): void => {
    window.setTimeout(() => {
      valueInputRef.current?.focus();
    }, 0);
  };

  const resetEditor = (): void => {
    setValue('');
    setEditingInputId(null);
    setValidationMessage('');
    focusValueInput();
  };

  const commitInput = (): void => {
    const normalizedValue =
      selectedBaseId === 'boolean' &&
      value.trim() === ''
        ? '1'
        : value.trim();

    const nextValidationMessage = validateInput(
      selectedBaseId,
      normalizedValue,
    );

    if (nextValidationMessage) {
      setValidationMessage(nextValidationMessage);
      valueInputRef.current?.focus();
      return;
    }

    if (editingInputId) {
      onInputsChange(
        inputs.map((input) =>
          input.id === editingInputId
            ? {
                ...input,
                baseId: selectedBaseId,
                value: normalizedValue,
              }
            : input,
        ),
      );
    } else {
      onInputsChange([
        ...inputs,
        {
          id: createInputId(),
          baseId: selectedBaseId,
          value: normalizedValue,
        },
      ]);
    }

    resetEditor();
  };

  const cancelEdit = (): void => {
    resetEditor();
  };

  const handleEdit = (
    input: ProgramInputItem,
  ): void => {
    setEditingInputId(input.id);
    setSelectedBaseId(input.baseId);
    setBaseQuery('');
    setIsBaseMenuOpen(false);
    setValue(input.value);
    setValidationMessage('');
    focusValueInput();
  };

  const handleDelete = (inputId: string): void => {
    onInputsChange(
      inputs.filter((input) => input.id !== inputId),
    );

    if (editingInputId === inputId) {
      cancelEdit();
    }
  };

  const handleBaseSelect = (
    baseId: ProgramInputBaseId,
  ): void => {
    setSelectedBaseId(baseId);
    setBaseQuery('');
    setIsBaseMenuOpen(false);
    setValidationMessage('');

    if (baseId === 'boolean' && value.trim() === '') {
      setValue('1');
    }

    focusValueInput();
  };

  const handleValueKeyDown = (
    event: KeyboardEvent<
      HTMLInputElement | HTMLSelectElement
    >,
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitInput();
    }

    if (event.key === 'Escape' && editingInputId) {
      event.preventDefault();
      cancelEdit();
    }
  };

  const previewInput = inputs
    .map((input) => input.value)
    .join('\n');

  return (
    <section className="input-builder shrink-0 border-t px-3.5 py-3 font-sans">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-wider">
            Program Input
          </h3>

          <p className="text-[10px]">
            Values are sent to stdin in the order shown.
          </p>
        </div>

        {inputs.length > 0 ? (
          <span className="input-count shrink-0 rounded-md px-2 py-1 text-[10px] font-bold">
            {inputs.length} line
            {inputs.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(150px,0.8fr)_minmax(150px,1fr)_auto]">
        <div className="relative" ref={baseMenuRef}>
          <label
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
            htmlFor="program-input-base"
          >
            Base
          </label>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              size={13}
            />

            <input
              aria-controls="program-input-base-list"
              aria-expanded={isBaseMenuOpen}
              className="input-field w-full rounded-lg border py-2 pl-8 pr-8 text-xs font-medium outline-none"
              id="program-input-base"
              onChange={(event) => {
                setBaseQuery(event.target.value);
                setIsBaseMenuOpen(true);
              }}
              onFocus={() => {
                setBaseQuery('');
                setIsBaseMenuOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const firstBase = filteredBases[0];

                  if (firstBase) {
                    handleBaseSelect(firstBase.id);
                  }
                }

                if (event.key === 'Escape') {
                  setIsBaseMenuOpen(false);
                  setBaseQuery('');
                }
              }}
              role="combobox"
              type="text"
              value={baseQuery || selectedBase.label}
            />

            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
              size={14}
            />
          </div>

          {isBaseMenuOpen ? (
            <div
              className="input-menu absolute left-0 right-0 top-full z-40 mt-1 max-h-44 overflow-auto rounded-lg border py-1 shadow-xl"
              id="program-input-base-list"
              role="listbox"
            >
              {filteredBases.length > 0 ? (
                filteredBases.map((base) => (
                  <button
                    aria-selected={
                      base.id === selectedBaseId
                    }
                    className="input-menu-item flex w-full flex-col px-3 py-2 text-left"
                    key={base.id}
                    onClick={() =>
                      handleBaseSelect(base.id)
                    }
                    onMouseDown={(
                      event: MouseEvent<HTMLButtonElement>,
                    ) => event.preventDefault()}
                    role="option"
                    type="button"
                  >
                    <span className="text-xs font-semibold">
                      {base.label}
                    </span>

                    <span className="text-[10px]">
                      {base.hint}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-[11px]">
                  No matching base.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div>
          <label
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
            htmlFor="program-input-value"
          >
            Value
          </label>

          {selectedBase.inputType === 'select' ? (
            <select
              className="input-field w-full rounded-lg border px-3 py-2 text-xs outline-none"
              id="program-input-value"
              onChange={(event) =>
                setValue(event.target.value)
              }
              onKeyDown={handleValueKeyDown}
              ref={(element) => {
                valueInputRef.current = element;
              }}
              value={value || '1'}
            >
              <option value="1">1 / true</option>
              <option value="0">0 / false</option>
            </select>
          ) : (
            <input
              className="input-field w-full rounded-lg border px-3 py-2 text-xs outline-none"
              id="program-input-value"
              inputMode={
                selectedBase.id === 'integer'
                  ? 'numeric'
                  : selectedBase.id === 'decimal'
                    ? 'decimal'
                    : 'text'
              }
              onChange={(event) => {
                setValue(event.target.value);
                setValidationMessage('');
              }}
              onKeyDown={handleValueKeyDown}
              placeholder={selectedBase.placeholder}
              ref={(element) => {
                valueInputRef.current = element;
              }}
              step={
                selectedBase.id === 'integer'
                  ? 1
                  : 'any'
              }
              type={selectedBase.inputType}
              value={value}
            />
          )}
        </div>

        <div className="flex items-end gap-2">
          <button
            className="primary-action inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold"
            onClick={commitInput}
            type="button"
          >
            {editingInputId ? (
              <Check aria-hidden="true" size={14} />
            ) : (
              <Plus aria-hidden="true" size={14} />
            )}

            {editingInputId ? 'Save' : 'Add Input'}
          </button>

          {editingInputId ? (
            <button
              aria-label="Cancel edit"
              className="icon-action h-9 w-9 rounded-lg"
              onClick={cancelEdit}
              title="Cancel edit"
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {validationMessage ? (
        <div
          className="mt-2 text-[11px] font-semibold text-red-400"
          role="alert"
        >
          {validationMessage}
        </div>
      ) : null}

      {inputs.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-lg border">
          <div className="input-list-header grid grid-cols-[40px_minmax(72px,0.7fr)_minmax(90px,1fr)_72px] gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider sm:grid-cols-[56px_minmax(72px,0.7fr)_minmax(90px,1fr)_72px]">
            <span>#</span>
            <span>Base</span>
            <span>Value</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y">
            {inputs.map((input, index) => {
              const inputBase = getInputBase(input.baseId);
              const isEditing =
                input.id === editingInputId;

              return (
                <div
                  className={[
                    'input-list-row grid grid-cols-[40px_minmax(72px,0.7fr)_minmax(90px,1fr)_72px] items-center gap-2 px-3 py-2 text-xs sm:grid-cols-[56px_minmax(72px,0.7fr)_minmax(90px,1fr)_72px]',
                    isEditing ? 'is-editing' : '',
                  ].join(' ')}
                  key={input.id}
                >
                  <span className="font-mono text-[11px]">
                    {index + 1}
                  </span>

                  <span className="truncate font-semibold">
                    {inputBase.label}
                  </span>

                  <code className="truncate rounded px-1.5 py-1 font-mono text-[11px]">
                    {input.value}
                  </code>

                  <span className="flex justify-end gap-1">
                    <button
                      aria-label={`Edit input ${index + 1}`}
                      className="icon-action h-7 w-7 rounded-md"
                      onClick={() => handleEdit(input)}
                      title="Edit"
                      type="button"
                    >
                      <Pencil
                        aria-hidden="true"
                        size={12}
                      />
                    </button>

                    <button
                      aria-label={`Delete input ${index + 1}`}
                      className="icon-action danger h-7 w-7 rounded-md"
                      onClick={() =>
                        handleDelete(input.id)
                      }
                      title="Delete"
                      type="button"
                    >
                      <Trash2
                        aria-hidden="true"
                        size={12}
                      />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {previewInput ? (
        <pre className="stdin-preview mt-2 max-h-20 overflow-auto rounded-lg border p-2 text-[10px]">
          {previewInput}
        </pre>
      ) : null}
    </section>
  );
};

export default ProgramInputBuilder;