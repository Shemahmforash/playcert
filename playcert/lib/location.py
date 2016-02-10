import logging
from requests.packages.urllib3.exceptions import ConnectionError
import requests
import sys

from playcert.cache.locations import cache_location

log = logging.getLogger(__name__)


class Location(object):

    def __init__(self, latitude, longitude, redis=None):
        self.latitude = float(latitude)
        self.longitude = float(longitude)
        self.location = None

        # to use cache in this class (not mandatory)
        self.redis = redis

        self.find_location(redis)
        return

    def coordinates_redis_key(self):
        latitude = self.latitude
        longitude = self.longitude

        if not latitude or not longitude:
            log.error('longitude and latitude are mandatory params')
            return None

        cache_key = "latitude.%.4f.longitude.%.4f" % (
            float(latitude), float(longitude))

        return cache_key

    @cache_location
    def find_location(self, redis=None):
        uri = "http://maps.googleapis.com/maps/api/geocode/json?latlng=%s,%s&sensor=true" % (
            self.latitude, self.longitude)

        try:
            request = requests.get(uri)
        except ConnectionError:
            log.error(
                'could not reach thisdayinmusic api %s', sys.exc_info()[0])
            return None

        location_data = request.json()

        # no results means no location
        if not len(location_data['results']):
            return

        log.debug('location data')
        log.debug(location_data)

        for result in location_data['results']:
            for component in result['address_components']:
                if 'political' in component['types']:
                    self.location = component['long_name']
                    return
