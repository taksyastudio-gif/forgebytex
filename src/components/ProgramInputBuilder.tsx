import React, {
  useMemo,
  useRef,
  useState,
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
  type: 'text' | 'number' | 'select';
  hint: string;
};

const INPUT_BASES: InputBase[] = [
  {
    id: 'text',
    label: 'Text',
    placeholder: 'hello world',
    type: 'text',
    hint: 'Sends one text line to stdin.',
  },
  {
    id: 'integer',
    label: 'Integer',
    placeholder: '42',
    type: 'number',
    hint: 'Whole numbers only.',
  },
  {
    id: 'decimal',
    label: 'Decimal',
    placeholder: '3.14',
    type: 'number',
    hint: 'Any finite decimal number.',
  },
  {
    id: 'character',
    label: 'Character',
    placeholder: 'A',
    type: 'text',
    hint: 'Exactly one character.',
  },
  {
    id: 'boolean',
    label: 'Boolean',
    placeholder: '1',
    type: 'select',
    hint: 'Sends 1 or 0.',
  },
];

const createInputId = () =>
  `stdin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const getBaseById = (baseId: ProgramInputBaseId) =>
  INPUT_BASES.find((base) => base.id === baseId) ?? INPUT_BASES[0];

const validateInputValue = (
  baseId: ProgramInputBaseId,
  value: string
) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 'Enter a value before adding input.';
  }

  if (baseId === 'integer' && !/^-?\d+$/.test(trimmedValue)) {
    return 'Integer input must be a whole number.';
  }

  if (
    baseId === 'decimal' &&
    !Number.isFinite(Number(trimmedValue))
  ) {
    return 'Decimal input must be a valid number.';
  }

  if (
    baseId === 'character' &&
    Array.from(trimmedValue).length !== 1
  ) {
    return 'Character input must contain exactly one character.';
  }

  if (
    baseId === 'boolean' &&
    trimmedValue !== '1' &&
    trimmedValue !== '0'
  ) {
    return 'Boolean input must be 1 or 0.';
  }

  return '';
};

export const ProgramInputBuilder: React.FC<ProgramInputBuilderProps> = ({
  inputs,
  onInputsChange,
}) => {
  const [selectedBaseId, setSelectedBaseId] =
    useState<ProgramInputBaseId>('text');
  const [baseQuery, setBaseQuery] = useState('');
  const [isBaseMenuOpen, setIsBaseMenuOpen] = useState(false);
  const [value, setValue] = useState('');
  const [editingInputId, setEditingInputId] =
    useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState('');

  const valueInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  const selectedBase = getBaseById(selectedBaseId);

  const filteredBases = useMemo(() => {
    const normalizedQuery = baseQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return INPUT_BASES;
    }

    return INPUT_BASES.filter((base) =>
      base.label.toLowerCase().includes(normalizedQuery)
    );
  }, [baseQuery]);

  const commitInput = () => {
    const trimmedValue =
      selectedBaseId === 'boolean' && value.trim() === ''
        ? '1'
        : value.trim();
    const nextValidationMessage = validateInputValue(
      selectedBaseId,
      trimmedValue
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
                value: trimmedValue,
              }
            : input
        )
      );
    } else {
      onInputsChange([
        ...inputs,
        {
          id: createInputId(),
          baseId: selectedBaseId,
          value: trimmedValue,
        },
      ]);
    }

    setValue('');
    setEditingInputId(null);
    setValidationMessage('');
    valueInputRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditingInputId(null);
    setValue('');
    setValidationMessage('');
    valueInputRef.current?.focus();
  };

  const handleEdit = (input: ProgramInputItem) => {
    setEditingInputId(input.id);
    setSelectedBaseId(input.baseId);
    setBaseQuery('');
    setValue(input.value);
    setValidationMessage('');
    valueInputRef.current?.focus();
  };

  const handleDelete = (inputId: string) => {
    onInputsChange(inputs.filter((input) => input.id !== inputId));

    if (editingInputId === inputId) {
      cancelEdit();
    }
  };

  const handleBaseSelect = (baseId: ProgramInputBaseId) => {
    setSelectedBaseId(baseId);
    setBaseQuery('');
    setIsBaseMenuOpen(false);

    if (baseId === 'boolean' && value.trim() === '') {
      setValue('1');
    }

    window.setTimeout(() => {
      valueInputRef.current?.focus();
    }, 0);
  };

  const handleValueKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitInput();
    }

    if (event.key === 'Escape' && editingInputId) {
      event.preventDefault();
      cancelEdit();
    }
  };

  const previewInput = inputs.map((input) => input.value).join('\n');

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

        {inputs.length > 0 && (
          <span className="input-count shrink-0 rounded-md px-2 py-1 text-[10px] font-bold">
            {inputs.length} line{inputs.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(150px,0.8fr)_minmax(150px,1fr)_auto]">
        <div className="relative">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider">
            Base
          </label>

          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            />
            <input
              type="text"
              value={baseQuery || selectedBase.label}
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
              aria-expanded={isBaseMenuOpen}
              aria-controls="program-input-base-list"
              className="input-field w-full rounded-lg border py-2 pl-8 pr-8 text-xs font-medium outline-none"
            />
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
            />
          </div>

          {isBaseMenuOpen && (
            <div
              id="program-input-base-list"
              role="listbox"
              className="input-menu absolute left-0 right-0 top-full z-40 mt-1 max-h-44 overflow-auto rounded-lg border py-1 shadow-xl"
            >
              {filteredBases.length > 0 ? (
                filteredBases.map((base) => (
                  <button
                    key={base.id}
                    type="button"
                    role="option"
                    aria-selected={base.id === selectedBaseId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleBaseSelect(base.id)}
                    className="input-menu-item flex w-full flex-col px-3 py-2 text-left"
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
          )}
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider">
            Value
          </label>

          {selectedBase.type === 'select' ? (
            <select
              ref={valueInputRef as React.RefObject<HTMLSelectElement>}
              value={value || '1'}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleValueKeyDown}
              className="input-field w-full rounded-lg border px-3 py-2 text-xs outline-none"
            >
              <option value="1">1 / true</option>
              <option value="0">0 / false</option>
            </select>
          ) : (
            <input
              ref={valueInputRef as React.RefObject<HTMLInputElement>}
              type={selectedBase.type}
              inputMode={
                selectedBase.id === 'integer'
                  ? 'numeric'
                  : selectedBase.id === 'decimal'
                    ? 'decimal'
                    : 'text'
              }
              step={selectedBase.id === 'integer' ? 1 : 'any'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleValueKeyDown}
              placeholder={selectedBase.placeholder}
              className="input-field w-full rounded-lg border px-3 py-2 text-xs outline-none"
            />
          )}
        </div>

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={commitInput}
            className="primary-action inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold"
          >
            {editingInputId ? (
              <Check size={14} />
            ) : (
              <Plus size={14} />
            )}
            {editingInputId ? 'Save' : 'Add Input'}
          </button>

          {editingInputId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="icon-action h-9 w-9 rounded-lg"
              aria-label="Cancel edit"
              title="Cancel edit"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {validationMessage && (
        <div
          role="alert"
          className="mt-2 text-[11px] font-semibold text-red-400"
        >
          {validationMessage}
        </div>
      )}

      {inputs.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border">
          <div className="input-list-header grid grid-cols-[56px_minmax(72px,0.7fr)_minmax(90px,1fr)_72px] gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider">
            <span>#</span>
            <span>Base</span>
            <span>Value</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y">
            {inputs.map((input, index) => {
              const inputBase = getBaseById(input.baseId);
              const isEditing = editingInputId === input.id;

              return (
                <div
                  key={input.id}
                  className={[
                    'input-list-row grid grid-cols-[56px_minmax(72px,0.7fr)_minmax(90px,1fr)_72px] items-center gap-2 px-3 py-2 text-xs',
                    isEditing ? 'is-editing' : '',
                  ].join(' ')}
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
                      type="button"
                      onClick={() => handleEdit(input)}
                      className="icon-action h-7 w-7 rounded-md"
                      aria-label={`Edit input ${index + 1}`}
                      title="Edit"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(input.id)}
                      className="icon-action danger h-7 w-7 rounded-md"
                      aria-label={`Delete input ${index + 1}`}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {previewInput && (
        <pre className="stdin-preview mt-2 max-h-20 overflow-auto rounded-lg border p-2 text-[10px]">
          {previewInput}
        </pre>
      )}
    </section>
  );
};

export default ProgramInputBuilder;
