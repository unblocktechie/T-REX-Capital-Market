// Read-only schema comparison. Never reads application records or secrets.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  try {
    const schemas = ['trexCapitalMarket', 'trexCapitalMarketMultichainTemp'];
    const read = async (view, fields, order) => (await connection.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME, ${fields} FROM information_schema.${view} WHERE TABLE_SCHEMA IN (?, ?) ORDER BY ${order}`, schemas))[0];
    const tables = await read('TABLES', 'TABLE_TYPE, ENGINE, TABLE_COLLATION', 'TABLE_SCHEMA,TABLE_NAME');
    const columns = await read('COLUMNS', 'COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION', 'TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION');
    const indexes = await read('STATISTICS', 'INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, INDEX_TYPE, COLLATION', 'TABLE_SCHEMA,TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
    const constraints = await read('KEY_COLUMN_USAGE', 'CONSTRAINT_NAME,COLUMN_NAME,ORDINAL_POSITION,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME', 'TABLE_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION');
    const rules = (await connection.query('SELECT CONSTRAINT_SCHEMA AS TABLE_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA IN (?,?) ORDER BY CONSTRAINT_SCHEMA,TABLE_NAME,CONSTRAINT_NAME', schemas))[0];
    const checks = (await connection.query('SELECT CONSTRAINT_SCHEMA AS TABLE_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA IN (?,?) ORDER BY CONSTRAINT_SCHEMA,TABLE_NAME,CONSTRAINT_NAME', schemas))[0];
    const clean = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['TABLE_SCHEMA','TABLE_NAME'].includes(key)));
    const snapshot = schema => Object.fromEntries(tables.filter(t => t.TABLE_SCHEMA === schema).map(t => [t.TABLE_NAME, {
      table: clean(t), columns: columns.filter(r => r.TABLE_SCHEMA === schema && r.TABLE_NAME === t.TABLE_NAME).map(clean),
      indexes: indexes.filter(r => r.TABLE_SCHEMA === schema && r.TABLE_NAME === t.TABLE_NAME).map(clean),
      constraints: constraints.filter(r => r.TABLE_SCHEMA === schema && r.TABLE_NAME === t.TABLE_NAME).map(clean),
      rules: rules.filter(r => r.TABLE_SCHEMA === schema && r.TABLE_NAME === t.TABLE_NAME).map(clean),
      checks: checks.filter(r => r.TABLE_SCHEMA === schema && r.TABLE_NAME === t.TABLE_NAME).map(clean),
    }]));
    const latest = snapshot(schemas[0]); const liveCopy = snapshot(schemas[1]);
    const added = Object.keys(latest).filter(t => !liveCopy[t]);
    const removed = Object.keys(liveCopy).filter(t => !latest[t]);
    const changes = [];
    for (const name of Object.keys(latest).filter(t => liveCopy[t])) {
      const a = latest[name]; const b = liveCopy[name]; const diff = {};
      for (const section of Object.keys(a)) {
        if (JSON.stringify(a[section]) === JSON.stringify(b[section])) continue;
        if (section === 'columns') {
          const keyed = rows => Object.fromEntries(rows.map(r => [r.COLUMN_NAME, r]));
          const ac = keyed(a.columns); const bc = keyed(b.columns);
          diff.columns = { added: a.columns.filter(r => !bc[r.COLUMN_NAME]), removed: b.columns.filter(r => !ac[r.COLUMN_NAME]),
            changed: a.columns.filter(r => bc[r.COLUMN_NAME]).flatMap(r => {
              const fields = Object.keys(r).filter(k => JSON.stringify(r[k]) !== JSON.stringify(bc[r.COLUMN_NAME][k]));
              return fields.length ? [{ name: r.COLUMN_NAME, fields: Object.fromEntries(fields.map(k => [k,{ liveCopy: bc[r.COLUMN_NAME][k], latest: r[k] }])) }] : [];
            }) };
        } else diff[section] = { liveCopy: b[section], latest: a[section] };
      }
      if (Object.keys(diff).length) changes.push({ table: name, ...diff });
    }
    const result = { generatedAt: new Date().toISOString(), latestDatabase: schemas[0], comparedDatabase: schemas[1],
      tableCounts: { latest: Object.keys(latest).length, liveCopy: Object.keys(liveCopy).length },
      addedTables: Object.fromEntries(added.map(t => [t,latest[t]])), onlyInLiveCopy: removed, changedTables: changes };
    const lines = ['# Local database schema comparison', '', `Latest: \`${schemas[0]}\`; mainnet copy: \`${schemas[1]}\`.`, '',
      'Read-only comparison of schema metadata. No rows were modified. Application data, settings values, routines, triggers and views definitions are not compared.', '',
      `Tables: latest **${result.tableCounts.latest}**, mainnet copy **${result.tableCounts.liveCopy}**.`, '', '## Tables only in latest', '', ...added.map(t => `- \`${t}\`: ${latest[t].columns.map(c=>`\`${c.COLUMN_NAME}\` (${c.COLUMN_TYPE})`).join(', ')}`), '',
      '## Tables only in mainnet copy', '', ...(removed.length ? removed.map(t=>`- \`${t}\``) : ['None.']), '', '## Changes in shared tables', ''];
    for (const change of changes) {
      lines.push(`### ${change.table}`, '');
      if (change.columns) {
        for (const col of change.columns.added) lines.push(`- Added column \`${col.COLUMN_NAME}\`: \`${col.COLUMN_TYPE}\`, nullable=${col.IS_NULLABLE}, default=${JSON.stringify(col.COLUMN_DEFAULT)}, extra=${col.EXTRA || 'none'}.`);
        for (const col of change.columns.removed) lines.push(`- Column absent in latest: \`${col.COLUMN_NAME}\` (${col.COLUMN_TYPE}).`);
        for (const col of change.columns.changed) lines.push(`- Changed \`${col.name}\`: ${Object.entries(col.fields).map(([k,v])=>`${k}: ${JSON.stringify(v.liveCopy)} → ${JSON.stringify(v.latest)}`).join('; ')}.`);
      }
      for (const section of ['table','indexes','constraints','rules','checks']) if (change[section]) lines.push('', `Changed ${section} (mainnet copy → latest):`, '```json', JSON.stringify(change[section],null,2), '```');
      lines.push('');
    }
    const dir = path.resolve(__dirname,'../docs');
    fs.writeFileSync(path.join(dir,'LOCAL-DATABASE-SCHEMA-COMPARISON.json'),JSON.stringify(result,null,2));
    fs.writeFileSync(path.join(dir,'LOCAL-DATABASE-SCHEMA-COMPARISON.md'),lines.join('\n'));
    console.log(JSON.stringify({ tableCounts: result.tableCounts, addedTables: added, onlyInLiveCopy: removed, changedTables: changes },null,2));
  } finally { await connection.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
