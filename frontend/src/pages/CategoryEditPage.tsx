import React, { useMemo, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import {
  useAllCategories,
  useCategoryTypes,
  useUpdateCategory,
  uploadCategoryIcon,
  useCreateCategory,
} from '../api/hooks';
import { Category, CategoryType } from '../types';
import { ConfirmationDialog } from '../components/ConfirmationDialog';

const PageWrapper = styled.div`
  padding: 1rem;
  color: #eaeaea;
`;


const IconBox = styled.div`
  width: 45px;
  height: 45px;
  background: #444;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  span {
    font-size: 0.8rem;
    text-align: center;
  }
`;

const SaveButton = styled.button`
  margin-left: auto;
  height: 45px;
  padding: 0 1.25rem;
  border: none;
  border-radius: var(--radius-md);
  background: white;
  color: black;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.2s ease;

  &:hover {
    background: #dedede;
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`;

const AddContainer = styled.div`
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #555;
  border-radius: var(--radius-md);
  background: #2a2a2a;
`;

const AddLabel = styled.div`
  font-size: 0.8rem;
  color: #bbb;
  margin-bottom: 0.5rem;
`;

const AddRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const AddInput = styled.input`
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #555;
  border-radius: var(--radius-md);
  background: #333;
  color: #eaeaea;
`;

const AddButton = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-positive);
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background: #059669;
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  height: 100%;
  justify-content: flex-end;
`;

const Label = styled.label`
  font-size: 0.75rem;
  color: #bbb;
`;

const StyledSelect = styled.select`
  padding: 0.5rem;
  border: 1px solid #555;
  border-radius: var(--radius-md);
  background: #333;
  color: #eaeaea;
  height: 45px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
`;

const EntryGrid = styled.div`
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) minmax(0, 1fr) 60px auto;
  gap: 1.25rem;
  align-items: flex-end;
  margin-bottom: 1rem;
  min-height: 65px;
`;

interface CategoryRowProps {
  cat: Category;
  categories: Category[];
  types: CategoryType[];
  getDescendants(id: number): number[];
}

const CategoryRow: React.FC<CategoryRowProps> = ({
  cat,
  categories,
  types,
  getDescendants,
}) => {
  const [parentId, setParentId] = useState<number | null>(cat.parent_id ?? null);
  const [typeId, setTypeId] = useState<number>(cat.type_id);
  const [icon, setIcon] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateMutation = useUpdateCategory(cat.id);

  useEffect(() => {
    setParentId(cat.parent_id ?? null);
    setTypeId(cat.type_id);
  }, [cat.parent_id, cat.type_id]);

  useEffect(() => {
    if (!icon) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(icon);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [icon]);

  const validParents = categories.filter(
    (c) =>
      c.type_id === typeId &&
      c.id !== cat.id &&
      !getDescendants(cat.id).includes(c.id) &&
      c.name !== "UNCLASSIFIED"
  );

  const handleSave = async () => {
    let icon_file = cat.icon_file;
    if (icon) {
      icon_file = await uploadCategoryIcon(icon);
    }
    await updateMutation.mutateAsync({ parent_id: parentId, type_id: typeId, icon_file });
  };

  return (
    <EntryGrid>
      <span>{cat.name}</span>
      <Cell>
        <Label>Parent category</Label>
        <StyledSelect
          value={parentId ?? ''}
          onChange={(e) => setParentId(e.target.value === '' ? null : parseInt(e.target.value))}
        >
          <option value="">No parent</option>
          {validParents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </StyledSelect>
      </Cell>
      <Cell>
        <Label>Type</Label>
        <StyledSelect value={typeId} onChange={(e) => setTypeId(parseInt(e.target.value))}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </StyledSelect>
      </Cell>
      <IconBox onClick={() => fileRef.current?.click()}>
        {preview ? (
          <img src={preview} alt="icon preview" />
        ) : cat.icon_file ? (
          <img src={`/api/download_static/${cat.icon_file}`} alt="icon" />
        ) : (
          <span> add icon </span>
        )}
        <input
          type="file"
          accept="image/png"
          style={{ display: 'none' }}
          ref={fileRef}
          onChange={(e) => setIcon(e.target.files?.[0] || null)}
        />
      </IconBox>
      <SaveButton onClick={handleSave}>Save</SaveButton>
    </EntryGrid>
  );
};

export default function CategoryEditPage() {
  const { data: categories = [] } = useAllCategories();
  const { data: types = [] } = useCategoryTypes();
  const createCategoryMutation = useCreateCategory();
  const [newCatName, setNewCatName] = useState('');
  const [showSemicolonDialog, setShowSemicolonDialog] = useState(false);

  const standardTypeId = useMemo(() => types.find(t => t.name === 'standard')?.id, [types]);

  const sorted = useMemo(() => {
    if (!standardTypeId) return categories.filter(c => c.name !== "UNCLASSIFIED");
    const standardIndex = categories.findIndex(c => c.type_id === standardTypeId);
    if (standardIndex === -1) return categories.filter(c => c.name !== "UNCLASSIFIED");
    const rest = categories.filter((_, idx) => idx !== standardIndex);
    return [categories[standardIndex], ...rest].filter(c => c.name !== "UNCLASSIFIED");
  }, [categories, standardTypeId]);

  const childrenMap = useMemo(() => {
    const map: Record<number, number[]> = {};
    categories.forEach(c => {
      if (c.parent_id) {
        if (!map[c.parent_id]) map[c.parent_id] = [];
        map[c.parent_id].push(c.id);
      }
    });
    return map;
  }, [categories]);

  const getDescendants = (id: number): number[] => {
    const result: number[] = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      const children = childrenMap[current] || [];
      for (const child of children) {
        result.push(child);
        stack.push(child);
      }
    }
    return result;
  };

  return (
    <PageWrapper>
      <h1>Categories</h1>
      <AddContainer>
        <AddLabel>Add new Category</AddLabel>
        <AddRow>
          <AddInput
            type="text"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="Category name"
          />
          <AddButton
            onClick={async () => {
              const name = newCatName.trim();
              if (!name) return;
              
              // check for semicolons
              if (name.includes(';')) {
                setShowSemicolonDialog(true);
                return;
              }
              
              const typeId = standardTypeId || (types[0] && types[0].id);
              if (!typeId) return;
              await createCategoryMutation.mutateAsync({ name, type_id: typeId, parent_id: null });
              setNewCatName('');
            }}
            disabled={!newCatName.trim() || createCategoryMutation.isPending}
          >
            Add
          </AddButton>
        </AddRow>
      </AddContainer>
      {sorted.map((cat) => (
        <CategoryRow
          key={cat.id}
          cat={cat}
          categories={categories}
          types={types}
          getDescendants={getDescendants}
        />
      ))}

      {/* Semicolon validation dialog */}
      <ConfirmationDialog
        isOpen={showSemicolonDialog}
        title="Invalid Character"
        message="Semicolon (;) characters are not allowed in category names. Please remove them before submitting."
        confirmText="OK"
        confirmVariant="primary"
        onConfirm={() => setShowSemicolonDialog(false)}
        onCancel={() => setShowSemicolonDialog(false)}
      />
    </PageWrapper>
  );
}
