/**
 * "Summary" screen – displays all payment items in a descending timeline with a
 * running total at the end.  Users can filter by incomes/expenses via the
 * NavigationBar.
 *
 * State Flow:
 * 
 * NavigationBar (presentational) <-> SummaryPage (filter + data fetching)
 * items -> PaymentList (presentational)
 */

// section for the tools to build this page
import React, { useCallback, useState, useMemo, useEffect } from 'react';
// helpers from React Router that let us work with the URL
import { useSearchParams, useNavigate } from 'react-router-dom';
// tools for creation and styling own components
import styled from 'styled-components';
// helper for formatting dates
import { format, parseISO } from 'date-fns';

// import the SVG icons from the assets folder
import UpIcon from '../assets/up.svg';
import DownIcon from '../assets/down.svg';

// import the type for the view filter
import { ViewFilter } from '../components/NavigationBar';
// imports the functions that let us fetch data from our app's server.
import { usePaymentItems, useAllCategories, useCategoryTypes, useRecipient, useCategory, downloadInvoice } from '../api/hooks';
// import data structures for payment items and categories.
import { PaymentItem, isExpense, Category } from '../types';


/* Styled Components */


// container for the sort icons
const SortIconsContainer = styled.div`
  display: flex; // Arranges the icons in a row.
  align-items: center; // Vertically centers the icons.
  gap: 0.5rem; // Adds a small space between the icons.
`;

// wrapper for each individual icon to handle hover effects
const IconWrapper = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  transition: background-color 0.2s ease-in-out;
  border-radius: var(--radius-sm);
  background-color: ${({ $active }) => ($active ? '#444' : 'transparent')};

  img {
    width: 25px; // Sets the width of the icon.
    height: 26px; // Sets the height of the icon.
    cursor: pointer; // Shows a hand cursor, indicating it's clickable.
  }

  // On hover, a background color is added to give feedback to the user.
  &:hover {
    background-color: #444;
  }
`;

//  container for our category filter section
const CategoryFilterWrapper = styled.div`
  padding: 1rem; //  adds some space inside the container.
  margin-bottom: 1rem; //  adds some space below the container.
  background: #2a2a2a; //  sets the background color.
  border-radius: var(--radius-lg); //  rounds the corners of the container.
  border: 1px solid #444; //  adds a border around the container.

  h3 {
    margin: 0 0 1rem 0; //  adds some space below the title.
    font-size: 1rem; //  sets the font size.
    color: #eaeaea; //  sets the text color.
  }
`;

//  container for the category dropdown and the "Add Category" button
const CategoryDropdownContainer = styled.div`
  display: flex; //  arranges the items in a row.
  gap: 0.5rem; //  adds some space between the items.
  margin-bottom: 1rem; //  adds some space below the container.
  align-items: center; //  vertically aligns the items in the center.

  select {
    flex: 1; //  makes the dropdown take up as much space as possible.
    padding: 0.5rem; //  adds some space inside the dropdown.
    background-color: #333; //  sets the background color.
    color: #eaeaea; //  sets the text color.
    border: 1px solid #555; //  adds a border around the dropdown.
    border-radius: var(--radius-md); //  rounds the corners of the dropdown.
    font-size: 0.9rem; //  sets the font size.

    // When you click on the dropdown, we highlight it with a green border.
    &:focus {
      outline: none; //  removes the default blue outline.
      border-color: var(--color-positive); //  sets the border color to green.
    }
  }
`;

//  "Add Category" button
const AddCategoryButton = styled.button`
  background: var(--color-positive); //  sets the background color to green.
  color: white; //  sets the text color to white.
  border: none; //  removes the button border.
  padding: 0.5rem 1rem; //  adds some space inside the button.
  border-radius: var(--radius-md); //  rounds the corners of the button.
  font-size: 0.9rem; //  sets the font size.
  cursor: pointer; //  shows a hand cursor when you hover over the button.
  white-space: nowrap; //  prevents the text from wrapping to the next line.
  transition: background-color 0.2s ease; //  creates a smooth color change on hover.

  //  makes the button a darker green when you hover over it.
  &:hover {
    background: #059669;
  }

  //  styles the button when it's disabled.
  &:disabled {
    background: #666; //  sets a grey background color.
    cursor: not-allowed; //  shows a "not allowed" cursor.
  }
`;

//  container for the selected category tags
const SelectedCategoriesContainer = styled.div`
  display: flex; //  arranges the tags in a row.
  flex-wrap: wrap; //  allows the tags to wrap to the next line if there's not enough space.
  gap: 0.5rem; //  adds some space between the tags.
  margin-bottom: 1rem; //  adds some space below the container.
  min-height: 2rem; //  sets a minimum height for the container.
  align-items: flex-start; //  aligns the tags to the top of the container.
`;

//  single category tag
const CategoryTag = styled.div`
  background: #444; //  sets the background color.
  color: #eaeaea; //  sets the text color.
  padding: 0.25rem 0.75rem; //  adds some space inside the tag.
  border-radius: var(--radius-md); //  rounds the corners of the tag.
  font-size: 0.8rem; //  sets the font size.
  display: flex; //  arranges the items in a row.
  align-items: center; //  vertically aligns the items in the center.
  gap: 0.5rem; //  adds some space between the items.

  button {
    background: none; //  makes the button background transparent.
    border: none; //  removes the button border.
    color: #aaa; //  sets the text color.
    cursor: pointer; //  shows a hand cursor when you hover over the button.
    padding: 0; //  removes the default padding.
    font-size: 1rem; //  sets the font size.
    line-height: 1; //  sets the line height.

    //  changes the color of the "x" when you hover over it.
    &:hover {
      color: #fff;
    }
  }
`;

//  "Reset All" button for the category filters
const ResetButton = styled.button`
  background: #666; //  sets the background color.
  color: white; //  sets the text color.
  border: none; //  removes the button border.
  padding: 0.25rem 0.5rem; //  adds some space inside the button.
  border-radius: var(--radius-md); //  rounds the corners of the button.
  font-size: 0.8rem; //  sets the font size.
  cursor: pointer; //  shows a hand cursor when you hover over the button.
  align-self: flex-end; //  aligns the button to the bottom of the container.
  margin-left: auto; //  pushes the button to the right.

  //  changes the background color when you hover over the button.
  &:hover {
    background: #777;
  }
`;

//  message we show when there are no category filters applied
const EmptyState = styled.div`
  color: #888; //  sets the text color.
  font-size: 0.8rem; //  sets the font size.
  font-style: italic; //  makes the text italic.
`;

//  list that will contain our payment items
const List = styled.ul`
  list-style: none; //  removes the default bullet points.
  padding: 0; //  removes the default padding.
  margin: var(--spacing-md) 0; //  adds some space above and below the list.
  display: flex; //  arranges the items in a flexible way.
  flex-direction: column; //  stacks the items vertically.
  gap: var(--spacing-sm); //  adds some space between the items.
`;

//  single payment item in our list
const Entry = styled.li`
  background: #333; //  sets the background color.
  border-radius: var(--radius-lg); //  rounds the corners of the item.
  padding: var(--spacing-md); //  adds some space inside the item.
  display: flex; //  arranges the content of the item in a flexible way.
  align-items: stretch; //  makes the content of the item stretch to fill the height.
  gap: var(--spacing-md); //  adds some space between the content items.
  width: 100%; //  makes the item take up the full width of its container.
  box-sizing: border-box; //  makes sure the padding and border are included in the total width.
  position: relative; //  allows us to position the download link absolutely within the entry.
`;

//  container for the category icon (previously used for payment item images)
const ImageHolder = styled.div`
  flex: 0 0 28%; //  makes the icon container take up 25% of the width of the item.
  min-width: 60px; //  sets a minimum width for smaller screens.
  max-width: 120px; //  sets a maximum width for the icon container.
  aspect-ratio: 1 / 1; //  makes the icon container a square.
  border-radius: var(--radius-md); //  rounds the corners of the icon container.
  background-color: #333; //  matches the Entry background color for seamless icon background rendering.
  overflow: hidden; //  hides any part of the icon that goes outside the container.
  display: flex; //  arranges the content of the container in a flexible way.
  align-items: center; //  vertically aligns the content in the center.
  justify-content: center; //  horizontally aligns the content in the center.
  position: relative; //  allows for proper positioning of the icon.

  img {
    width: 67%; //  makes the icon take up 70% of the container width for proper sizing.
    height: 67%; //  makes the icon take up 70% of the container height for proper sizing.
    object-fit: contain; //  preserves the icon's aspect ratio and prevents distortion.
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3)); //  adds a subtle shadow for better visibility.
    transition: transform 0.2s ease; //  adds a smooth transition for hover effects.
  }

  // Responsive sizing for different screen sizes
  @media (max-width: 768px) {
    flex: 0 0 20%; // Smaller percentage on mobile devices.
    min-width: 50px; // Smaller minimum width on mobile.
    max-width: 80px; // Smaller maximum width on mobile.
    
    img {
      width: 75%; // Slightly larger icon percentage on smaller screens for better visibility.
      height: 75%;
    }
  }

  @media (min-width: 1200px) {
    max-width: 140px; // Larger maximum width on larger screens.
    
    img {
      width: 65%; // Slightly smaller icon percentage on larger screens for better proportions.
      height: 65%;
    }
  }

`;

//  container for the main content of the payment item, to the right of the image
const ContentWrapper = styled.div`
  flex: 1 1 auto; //  makes the container take up as much space as possible.
  display: flex; //  arranges the content of the container in a flexible way.
  flex-direction: column; //  stacks the content vertically.
  justify-content: space-between; //  spreads out the content to fill the available space.
`;

//  container for the date and other meta information
const MetaInfo = styled.div`
  display: flex; //  arranges the items in a flexible way.
  flex-direction: column; //  stacks the items vertically.
  gap: var(--spacing-xs); //  adds some space between the items.
`;

//  text for the date
const DateText = styled.span`
  font-size: 0.9rem; //  sets the font size.
  color: var(--color-text-secondary); //  sets the text color.
  margin-bottom: var(--spacing-sm); //  adds some space below the date.
  display: block; //  makes the date take up its own line.
`;

//  container for the recipient information
const RecipientInfo = styled.div`
  font-size: 0.8rem; //  sets the font size.
  color: #bbb; //  sets the text color.
  margin-bottom: var(--spacing-xs); //  adds some space below the container.
  
  .name {
    font-weight: 500; //  makes the font bold.
    color: #ddd; //  sets the text color.
  }
  
  .address {
    font-size: 0.75rem; //  sets the font size.
    color: #999; //  sets the text color.
    margin-top: 2px; //  adds some space above the address.
  }
`;

//  container for the category chips
const CategoriesInfo = styled.div`
  display: flex; //  arranges the chips in a row.
  flex-wrap: wrap; //  allows the chips to wrap to the next line if there's not enough space.
  gap: 0.25rem; //  adds some space between the chips.
  margin-top: var(--spacing-xs); //  adds some space above the container.
`;

//  single category chip
const CategoryChip = styled.span`
  background: #555; //  sets the background color.
  color: #ccc; //  sets the text color.
  padding: 0.125rem 0.5rem; //  adds some space inside the chip.
  border-radius: var(--radius-sm); //  rounds the corners of the chip.
  font-size: 0.7rem; //  sets the font size.
  font-weight: 500; //  makes the font bold.
`;

//  container for the amount, which pushes it to the right side of the item
const AmountContainer = styled.div`
  margin-left: auto; //  pushes the container to the right.
  text-align: right; //  aligns the text to the right.
  position: relative; //  allows us to position the download link absolutely.
`;

//  download link for invoice files
const DownloadLink = styled.a`
  position: absolute; //  positions the link absolutely within the Entry.
  top: 1rem; //  positions the link at the top of the entry.
  right: 1rem; //  positions the link at the right of the entry.
  color:rgb(6, 116, 233); //  sets the text color to blue.
  font-size: 0.9rem; //  sets the font size slightly bigger.
  text-decoration: none; //  removes the underline.
  cursor: pointer; //  shows a hand cursor when you hover over the link.
  padding: 0.25rem 0.5rem; //  adds some padding for better click area.
  border-radius: var(--radius-sm); //  rounds the corners.
  transition: all 0.2s ease; //  creates a smooth transition on hover.
  //background-color: rgba(0, 123, 255, 0.1);  adds a subtle background.
  z-index: 10; //  ensures the link appears above other elements.

  &:hover {
    // background-color: rgba(0, 123, 255, 0.2);  adds a stronger background on hover.
    text-decoration: underline; //  adds an underline on hover.
    color:rgb(0, 123, 255); //  makes the color darker on hover.
  }
`;

//  text for the amount
const AmountText = styled.span<{ $negative: boolean }>`
  font-size: 1.5rem; //  sets the font size.
  font-weight: bold; //  makes the font bold.
  //  sets the text color to red for expenses and green for incomes.
  color: ${({ $negative }) =>
    $negative ? 'var(--color-negative)' : 'var(--color-positive)'};
  display: block; //  makes the amount take up its own line.
`;

//  container for the "Total" row at the bottom of the list
const TotalEntry = styled(Entry)`
  background: #444; //  sets a different background color for the total row.
  margin-top: var(--spacing-md); //  adds some space above the total row.
  border-top: 1px solid #555; //  adds a line above the total row.
  font-weight: bold; //  makes the font bold.
`;

//  label for the total row, "SUM"
const TotalLabel = styled.div`
    flex: 1 1 auto; //  makes the label take up as much space as possible.
    font-size: 1.2rem; //  sets the font size.
`;


/* Component */

interface SortIconsProps {
  sortOrder: 'asc' | 'desc';
  onSortAsc: () => void;
  onSortDesc: () => void;
}

/**
 * SortIcons component renders the up and down arrows for sorting.
 * - 'up.svg' is for descending order.
 * - 'down.svg' is for ascending order.
 */
const SortIcons: React.FC<SortIconsProps> = ({
  sortOrder,
  onSortAsc,
  onSortDesc,
}) => (
  <SortIconsContainer>
    <IconWrapper onClick={onSortDesc} $active={sortOrder === 'desc'}>
      <img id="sort-desc-icon" src={UpIcon} alt="Sort descending by date" />
    </IconWrapper>
    <IconWrapper onClick={onSortAsc} $active={sortOrder === 'asc'}>
      <img id="sort-asc-icon" src={DownIcon} alt="Sort ascending by date" />
    </IconWrapper>
  </SortIconsContainer>
);

//  main component for our summary page
const SummaryPage: React.FC = () => {
  // These are helpers from React Router that let us work with the URL
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  //  gets the current view filter ("all", "expenses", or "incomes") from the URL
  const viewFilter = (searchParams.get('filter') as ViewFilter) || 'all';

  // store the state for our category filter
  const initialCategoryIds = searchParams.getAll('categories').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(initialCategoryIds);
  const [selectedDropdownCategory, setSelectedDropdownCategory] = useState<number | ''>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  //  fetches all the categories and category types from the server
  const { data: allCategories = [], isLoading: isLoadingCategories } = useAllCategories();
  const { data: categoryTypes = [] } = useCategoryTypes();
  //  finds the ID of the "standard" category type
  const standardTypeId = useMemo(() => categoryTypes.find(t => t.name === 'standard')?.id, [categoryTypes]);

  //  special function from React that runs whenever the URL changes
  // It makes sure that our selected category filters are in sync with the URL
  useEffect(() => {
    const urlCategoryIds = searchParams.getAll('categories').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    setSelectedCategoryIds(urlCategoryIds);
  }, [searchParams]);

  //  special function from React that runs whenever the selected category filters change
  // It updates the URL to reflect the new filters
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    //  remove the old category filters from the URL
    newSearchParams.delete('categories');
    
    //  add the new category filters to the URL
    selectedCategoryIds.forEach(id => newSearchParams.append('categories', id.toString()));
    
    //  only update the URL if the filters have actually changed
    const currentCategoryParams = searchParams.getAll('categories').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    const hasChanged = currentCategoryParams.length !== selectedCategoryIds.length ||
                       !currentCategoryParams.every(id => selectedCategoryIds.includes(id));
    
    if (hasChanged) {
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [selectedCategoryIds, setSearchParams]);

  //  fetches the payment items from the server, based on the current filters
  const queryResult = usePaymentItems({
    expenseOnly: viewFilter === 'expenses',
    incomeOnly: viewFilter === 'incomes',
    categoryIds: selectedCategoryIds,
  });

  //  get the payment items, loading state, and error state from the query result
  const queryData: PaymentItem[] | undefined = queryResult.data;
  const isLoading: boolean = queryResult.isLoading;
  const error: Error | null = queryResult.error;

  //  makes sure that we always have an array of payment items to work with, even if the data is still loading
  const paymentDataForMemo: PaymentItem[] = queryData ?? [];


  /* Derived Data */

  //  sorts the payment items by date, with the most recent items first
  const sorted: PaymentItem[] = useMemo(() => {
    return [...paymentDataForMemo].sort((a: PaymentItem, b: PaymentItem) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (sortOrder === 'desc') {
        return dateB - dateA;
      }
      return dateA - dateB;
    });
  }, [paymentDataForMemo, sortOrder]);

  //  calculates the total amount of all the payment items
  const total: number = useMemo(() => {
    return paymentDataForMemo.reduce(
      (sum: number, item: PaymentItem) => sum + item.amount,
      0
    );
  }, [paymentDataForMemo]);

  //  gets the full category objects for the selected category IDs
  const selectedCategories = useMemo(() => {
    return allCategories.filter(cat => cat.name !== "UNCLASSIFIED" && selectedCategoryIds.includes(cat.id));
  }, [allCategories, selectedCategoryIds]);


  /* Callbacks */

  // function for "Add Category" button
  const handleAddCategory = useCallback(() => {
    if (selectedDropdownCategory && !selectedCategoryIds.includes(selectedDropdownCategory as number)) {
      setSelectedCategoryIds(prev => [...prev, selectedDropdownCategory as number]);
      setSelectedDropdownCategory('');
    }
  }, [selectedDropdownCategory, selectedCategoryIds]);

  // function for the "x" on a category tag
  const handleRemoveCategory = useCallback((categoryId: number) => {
    setSelectedCategoryIds(prev => prev.filter(id => id !== categoryId));
  }, []);

  //  function for the "Reset All" button
  const handleResetFilters = useCallback(() => {
    setSelectedCategoryIds([]);
  }, []);

  // function for the menu icon.
  const handleMenu = useCallback(() => {
    // in the future, this will open a side menu.
    console.info('Menu clicked');
  }, []);

  // function for the "ADD" button.
  const handleAdd = useCallback(() => {
    navigate('/add');
  }, [navigate]);


  /* Render */  

  // if there was an error fetching the payment items, show an error message
  if (error) return <p>Error: {error.message}</p>;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          gap: '0.5rem',
        }}
      >
        <h2>Payments</h2>
        <SortIcons
          sortOrder={sortOrder}
          onSortAsc={() => setSortOrder('asc')}
          onSortDesc={() => setSortOrder('desc')}
        />
      </div>
      <CategoryFilterWrapper>
        <h3>Filter by Categories</h3>
        
        <CategoryDropdownContainer>
          <select
            value={selectedDropdownCategory}
            onChange={(e) => setSelectedDropdownCategory(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            disabled={isLoadingCategories}
          >
            <option value="">Select a category...</option>
            {allCategories
              .filter(cat => cat.name !== "UNCLASSIFIED" && !selectedCategoryIds.includes(cat.id))
              .map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))
            }
          </select>
          <AddCategoryButton
            onClick={handleAddCategory}
            disabled={!selectedDropdownCategory || isLoadingCategories}
          >
            Add Category
          </AddCategoryButton>
        </CategoryDropdownContainer>

        <SelectedCategoriesContainer>
          {selectedCategories.length === 0 ? (
            <EmptyState>No category filters applied - showing all payments</EmptyState>
          ) : (
            <>
              {selectedCategories.map(cat => (
                <CategoryTag key={cat.id}>
                  {cat.name}
                  <button onClick={() => handleRemoveCategory(cat.id)} aria-label={`Remove ${cat.name} filter`}>
                    ×
                  </button>
                </CategoryTag>
              ))}
              <ResetButton onClick={handleResetFilters}>
                Reset All
              </ResetButton>
            </>
          )}
        </SelectedCategoriesContainer>

        {isLoadingCategories && <p>Loading categories...</p>}
      </CategoryFilterWrapper>

      {isLoading ? (
        <p>Loading payment items…</p>
      ) : (
        <List>
          {sorted.map(item => (
            <PaymentItemLine
              key={item.id}
              item={item}
              allCategories={allCategories}
            />
          ))}

          {/* Total row */}
          <TotalEntry>
            <TotalLabel>SUM</TotalLabel>
            <AmountContainer>
              <AmountText $negative={total < 0}>
                {total.toFixed(2)} €
              </AmountText>
            </AmountContainer>
          </TotalEntry>
        </List>
      )}
    </>
  );
};

export default SummaryPage;


/* Child component: PaymentItemLine  */


// define the "props" that our PaymentItemLine component accepts
interface PaymentItemLineProps {
  item: PaymentItem; // payment item to display
  allCategories: Category[]; // list of all categories
}

// displays a single payment item in our list
const PaymentItemLine: React.FC<PaymentItemLineProps> = ({ item, allCategories }) => {
  const navigate = useNavigate();
  // get the URL for the payment item's image
  const imageUrl = item.attachment_url;
  // fetch the recipient information for the payment item
  const { data: fetchedRecipient } = useRecipient(item.recipient_id ?? undefined);
  const recipient = item.recipient ?? fetchedRecipient;

  // fetch the standard category if we have a standard_category_id
  const { data: standardCategory } = useCategory(item.standard_category_id ?? undefined);

  // find the icon for the payment item's standard category
  const iconUrl = React.useMemo(() => {
    // use the fetched standard category or the one from the item
    const category = item.standard_category || standardCategory;
    
    if (category) {
      // check the category and its parents for an icon
      let current: Category | undefined = category;
      while (current) {
        if (current.icon_file) {
          return `/api/download_static/${current.icon_file}`;
        }
        current = allCategories.find(c => c.id === current?.parent_id);
      }
    }
    
    return null;
  }, [item.standard_category, standardCategory, allCategories]);

  const handleDoubleClick = () => {
    navigate(`/payment/${item.id}/edit`);
  };

  const handleDownloadInvoice = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent triggering the double-click edit
    try {
      await downloadInvoice(item.id);
    } catch (error) {
      console.error('Error downloading invoice:', error);
    }
  };

  return (
    <Entry onDoubleClick={handleDoubleClick}>
      {/* Download link for invoice - positioned at top right of entry */}
      {item.invoice_path && (
        <DownloadLink onClick={handleDownloadInvoice}>
          download
        </DownloadLink>
      )}
      
      <ImageHolder>
        {iconUrl ? (
          <img src={iconUrl} alt="Category icon" />
        ) : (
          // if no category icon, the area maintains the Entry background color
          null
        )}
      </ImageHolder>

      <ContentWrapper>
        <MetaInfo>
          {/* Date is above the amount (in its own block) */}
          <DateText>{format(parseISO(item.date), 'PPP, HH:mm')}</DateText>
          
          {/* Payment description */}
          {item.description && (
            <RecipientInfo>
              <div className="name" style={{ fontStyle: 'italic', color: '#ddd' }}>
                {item.description}
              </div>
            </RecipientInfo>
          )}
          
          {/* enhanced recipient information display */}
          {recipient && (
            <RecipientInfo>
              <div className="name"> { isExpense(item) ? (<u>To:</u>) : (<u>From:</u>) }  {recipient.name}</div>
              {recipient.address && (
                <div className="address">{recipient.address}</div>
              )}
            </RecipientInfo>
          )}
          
          {/* enhanced categories display */}
          {item.categories && item.categories.length > 0 && (
            <CategoriesInfo>
              {item.categories.map(category => (
                <CategoryChip key={category.id}>
                  {category.name}
                </CategoryChip>
              ))}
            </CategoriesInfo>
          )}
        </MetaInfo>
        <AmountContainer>
          <AmountText $negative={isExpense(item)}>
            {item.amount.toFixed(2)} €
          </AmountText>
        </AmountContainer>
      </ContentWrapper>
    </Entry>
  );
};
