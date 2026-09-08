const crypto = require('node:crypto');
const { Country, State, City } = require('country-state-city');
const isoCountries = require('i18n-iso-countries');
const { getPool, closePool } = require('../src/database/connection');

const deterministicUid = (namespace, value) => {
  const bytes = crypto.createHash('sha256').update(`${namespace}:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const insertBatches = async (connection, table, columns, rows, updateColumns, batchSize = 500) => {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const updates = updateColumns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
    await connection.query(
      `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
      batch.flat(),
    );
  }
};

const seedLocations = async () => {
  const connection = await getPool().getConnection();
  try {
    const countries = Country.getAllCountries();
    const countryRows = countries.map((country) => [
      deterministicUid('country', country.isoCode),
      country.isoCode,
      isoCountries.alpha2ToNumeric(country.isoCode),
      country.name,
      country.phonecode || null,
      country.currency || null,
      true,
      false,
    ]);
    await insertBatches(
      connection,
      'countryMaster',
      ['countryUid', 'countryCode', 'numericCode', 'countryName', 'phoneCode', 'currencyCode', 'isActive', 'isDeleted'],
      countryRows,
      ['numericCode', 'countryName', 'phoneCode', 'currencyCode', 'isActive', 'isDeleted'],
    );

    let stateCount = 0;
    let cityCount = 0;
    for (const [countryIndex, country] of countries.entries()) {
      const countryUid = deterministicUid('country', country.isoCode);
      const states = State.getStatesOfCountry(country.isoCode);
      const stateRows = states.map((state) => [
        deterministicUid('state', `${country.isoCode}:${state.isoCode}`),
        countryUid,
        state.isoCode,
        state.name,
        true,
        false,
      ]);
      if (stateRows.length) {
        await insertBatches(
          connection,
          'stateMaster',
          ['stateUid', 'countryUid', 'stateCode', 'stateName', 'isActive', 'isDeleted'],
          stateRows,
          ['stateName', 'isActive', 'isDeleted'],
        );
      }
      stateCount += stateRows.length;

      for (const state of states) {
        const stateUid = deterministicUid('state', `${country.isoCode}:${state.isoCode}`);
        const cities = City.getCitiesOfState(country.isoCode, state.isoCode);
        const cityRows = cities.map((city) => [
          deterministicUid('city', `${country.isoCode}:${state.isoCode}:${city.name.toLowerCase()}`),
          countryUid,
          stateUid,
          city.name,
          true,
          false,
        ]);
        if (cityRows.length) {
          await insertBatches(
            connection,
            'cityMaster',
            ['cityUid', 'countryUid', 'stateUid', 'cityName', 'isActive', 'isDeleted'],
            cityRows,
            ['countryUid', 'cityName', 'isActive', 'isDeleted'],
          );
        }
        cityCount += cityRows.length;
      }
      if ((countryIndex + 1) % 25 === 0 || countryIndex === countries.length - 1) {
        console.log(`Seeded ${countryIndex + 1}/${countries.length} countries, ${stateCount} states, ${cityCount} cities.`);
      }
    }
    await connection.query('ALTER TABLE `countryMaster` MODIFY COLUMN `numericCode` CHAR(3) NOT NULL');
    console.log(`Location seed completed: ${countries.length} countries, ${stateCount} states, ${cityCount} cities.`);
  } finally {
    connection.release();
  }
};

seedLocations()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(closePool);

module.exports = { deterministicUid, insertBatches };
