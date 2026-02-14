/**
 * Statistics Page — financial charts and visualizations.
 *
 * Top:    Running balance over time (area/line chart).
 * Bottom: Income by category (left pie) | Expense by category (right pie).
 */

import React, { useMemo } from 'react';
import styled from 'styled-components';
import { parseISO } from 'date-fns';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';

import { usePaymentItems, useAllCategories } from '../api/hooks';
import { PaymentItem, Category, isExpense, isIncome } from '../types';


/* ───────────── Colour palette ───────────── */

const INCOME_COLORS = [
    '#10b981', '#34d399', '#6ee7b7', '#059669',
    '#047857', '#a7f3d0', '#065f46', '#22c55e',
];

const EXPENSE_COLORS = [
    '#ef4444', '#f87171', '#fca5a5', '#dc2626',
    '#b91c1c', '#fecaca', '#991b1b', '#f97316',
];


/* ───────────── Styled components ───────────── */

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: var(--spacing-lg);
  padding-bottom: var(--spacing-lg);
`;

const PageTitle = styled.h2`
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
`;

const ChartCard = styled.section`
  background: var(--color-surface);
  border: 1px solid #272727;
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ChartTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #ccc;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
`;

const PieRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const PieWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
`;

const PieLabel = styled.h4`
  font-size: 0.9rem;
  font-weight: 600;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
`;

const EmptyHint = styled.p`
  color: #666;
  font-style: italic;
  text-align: center;
  padding: 2rem 0;
`;


/* ───────────── Helpers ───────────── */

/** Build running-balance data sorted by date ascending. */
function buildBalanceTimeline(items: PaymentItem[]) {
    const sorted = [...items].sort(
        (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime(),
    );

    let balance = 0;
    return sorted.map((item) => {
        balance += item.amount;
        const d = parseISO(item.date);
        return {
            date: d.getTime(),          // numeric timestamp for XAxis
            dateLabel: d.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            }),
            balance: Math.round(balance * 100) / 100,
        };
    });
}

/** Group items by their primary category name, returning { name, value }[]. */
function groupByCategory(
    items: PaymentItem[],
    allCategories: Category[],
): { name: string; value: number }[] {
    // Build a flat lookup map: category id → name
    const catNameById = new Map<number, string>();
    const flattenCategories = (cats: Category[]) => {
        for (const cat of cats) {
            catNameById.set(cat.id, cat.name);
            if (cat.children) flattenCategories(cat.children);
        }
    };
    flattenCategories(allCategories);

    const map = new Map<string, number>();

    for (const item of items) {
        let catName = 'Uncategorised';

        // Try resolving via standard_category_id first (most reliable — always populated)
        if (item.standard_category_id != null) {
            const resolved = catNameById.get(item.standard_category_id);
            if (resolved && resolved !== 'UNCLASSIFIED') {
                catName = resolved;
            }
        }
        // Fallback: try the resolved standard_category object
        else if (item.standard_category?.name && item.standard_category.name !== 'UNCLASSIFIED') {
            catName = item.standard_category.name;
        }
        // Fallback: try the categories array
        else if (item.categories && item.categories.length > 0) {
            const firstName = item.categories[0].name;
            if (firstName !== 'UNCLASSIFIED') catName = firstName;
        }

        const abs = Math.abs(item.amount);
        map.set(catName, (map.get(catName) ?? 0) + abs);
    }

    return Array.from(map.entries())
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
        .sort((a, b) => b.value - a.value);
}

/** Format a euro amount for axis ticks — always full numbers with dot separators. */
function formatEur(value: number): string {
    return value.toLocaleString('de-DE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }) + ' €';
}


/* ───────────── Custom tooltip ───────────── */

const TooltipBox = styled.div`
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  font-size: 0.82rem;
  color: #eaeaea;
  line-height: 1.5;
`;

const BalanceTooltip: React.FC<any> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <TooltipBox>
            <div style={{ color: '#888', marginBottom: 2 }}>{d.dateLabel}</div>
            <div>
                <strong style={{ color: d.balance >= 0 ? '#10b981' : '#ef4444' }}>
                    {d.balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </strong>
            </div>
        </TooltipBox>
    );
};

const PieTooltip: React.FC<any> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
        <TooltipBox>
            <div style={{ color: d.payload.fill, fontWeight: 600 }}>{d.name}</div>
            <div>{d.value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div>
        </TooltipBox>
    );
};


/* ───────────── Custom pie label ───────────── */

const renderPieLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent, name,
}: any) => {
    if (percent < 0.04) return null; // hide tiny slices
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text
            x={x}
            y={y}
            fill="#bbb"
            fontSize={11}
            textAnchor={x > cx ? 'start' : 'end'}
            dominantBaseline="central"
        >
            {name} ({(percent * 100).toFixed(0)}%)
        </text>
    );
};


/* ───────────── Component ───────────── */

const StatisticsPage: React.FC = () => {
    const { data: items = [], isLoading } = usePaymentItems();
    const { data: allCategories = [] } = useAllCategories();

    /* Balance timeline */
    const timeline = useMemo(() => buildBalanceTimeline(items), [items]);

    /* Pie data */
    const incomeData = useMemo(
        () => groupByCategory(items.filter(isIncome), allCategories),
        [items, allCategories],
    );
    const expenseData = useMemo(
        () => groupByCategory(items.filter(isExpense), allCategories),
        [items, allCategories],
    );

    if (isLoading) return <p>Loading statistics…</p>;

    return (
        <PageWrapper>
            <PageTitle>Statistics</PageTitle>

            {/* ── Balance over time ── */}
            <ChartCard>
                <ChartTitle>Account Balance Over Time</ChartTitle>
                {timeline.length === 0 ? (
                    <EmptyHint>No payment data available.</EmptyHint>
                ) : (
                    <ResponsiveContainer width="100%" height={360}>
                        <AreaChart data={timeline} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                            <defs>
                                <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                            <XAxis
                                dataKey="date"
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                scale="time"
                                tickFormatter={(ts: number) =>
                                    new Date(ts).toLocaleDateString('de-DE', {
                                        month: 'short',
                                        year: '2-digit',
                                    })
                                }
                                stroke="#555"
                                tick={{ fill: '#888', fontSize: 11 }}
                                tickLine={{ stroke: '#444' }}
                            />
                            <YAxis
                                tickFormatter={formatEur}
                                stroke="#555"
                                tick={{ fill: '#888', fontSize: 11 }}
                                tickLine={{ stroke: '#444' }}
                                width={95}
                            />
                            <RechartsTooltip content={<BalanceTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke="#10b981"
                                strokeWidth={2}
                                fill="url(#balanceGradient)"
                                dot={false}
                                activeDot={{ r: 5, fill: '#10b981', stroke: '#000', strokeWidth: 2 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            {/* ── Pie charts ── */}
            <ChartCard>
                <ChartTitle>Distribution by Category</ChartTitle>
                <PieRow>
                    {/* Incomes */}
                    <PieWrapper>
                        <PieLabel>Incomes</PieLabel>
                        {incomeData.length === 0 ? (
                            <EmptyHint>No income data.</EmptyHint>
                        ) : (
                            <ResponsiveContainer width="100%" height={320}>
                                <PieChart>
                                    <Pie
                                        data={incomeData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        innerRadius={40}
                                        paddingAngle={2}
                                        label={renderPieLabel}
                                        labelLine={{ stroke: '#555' }}
                                    >
                                        {incomeData.map((_, i) => (
                                            <Cell
                                                key={i}
                                                fill={INCOME_COLORS[i % INCOME_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip content={<PieTooltip />} />
                                    <Legend
                                        iconSize={10}
                                        wrapperStyle={{ fontSize: 11, color: '#aaa' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </PieWrapper>

                    {/* Expenses */}
                    <PieWrapper>
                        <PieLabel>Expenses</PieLabel>
                        {expenseData.length === 0 ? (
                            <EmptyHint>No expense data.</EmptyHint>
                        ) : (
                            <ResponsiveContainer width="100%" height={320}>
                                <PieChart>
                                    <Pie
                                        data={expenseData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        innerRadius={40}
                                        paddingAngle={2}
                                        label={renderPieLabel}
                                        labelLine={{ stroke: '#555' }}
                                    >
                                        {expenseData.map((_, i) => (
                                            <Cell
                                                key={i}
                                                fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip content={<PieTooltip />} />
                                    <Legend
                                        iconSize={10}
                                        wrapperStyle={{ fontSize: 11, color: '#aaa' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </PieWrapper>
                </PieRow>
            </ChartCard>
        </PageWrapper>
    );
};

export default StatisticsPage;
