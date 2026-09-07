const { ApiError } = require('../core/errors/api-error');

class LocationService {
  constructor(repository) { this.repository = repository; }

  listCountries(query) { return this.repository.listCountries(query); }

  async listStates(countryUid, query) {
    if (!await this.repository.findCountry(countryUid)) throw ApiError.notFound('Country was not found.');
    return this.repository.listStates(countryUid, query);
  }

  async listCities(stateUid, query) {
    if (!await this.repository.findState(stateUid)) throw ApiError.notFound('State was not found.');
    return this.repository.listCities(stateUid, query);
  }

  async validateHierarchy(countryUid, stateUid, cityUid) {
    if (!countryUid && (stateUid || cityUid)) throw ApiError.badRequest('Select a country before selecting a state or city.');
    if (!stateUid && cityUid) throw ApiError.badRequest('Select a state before selecting a city.');
    if (countryUid && !await this.repository.findCountry(countryUid)) throw ApiError.badRequest('The selected country does not exist.');
    if (stateUid) {
      const state = await this.repository.findState(stateUid);
      if (!state || state.countryUid !== countryUid) throw ApiError.badRequest('The selected state does not belong to the selected country.');
    }
    if (cityUid) {
      const city = await this.repository.findCity(cityUid);
      if (!city || city.stateUid !== stateUid || city.countryUid !== countryUid) {
        throw ApiError.badRequest('The selected city does not belong to the selected state and country.');
      }
    }
  }
}

module.exports = { LocationService };
