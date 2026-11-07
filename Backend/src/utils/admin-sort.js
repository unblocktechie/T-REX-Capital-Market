// SQL identifiers/expressions are supplied only by server-owned maps.
const orderBy = (options, columns, fallback, tie) => {
  if (!options.sortBy) return fallback;
  const column = Object.hasOwn(columns, options.sortBy) ? columns[options.sortBy] : null;
  if (!column) return fallback;
  const direction = String(options.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction},${tie} ${direction}`;
};
module.exports = { orderBy };
