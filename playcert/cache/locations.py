import logging

from functools import wraps


log = logging.getLogger(__name__)


def cache_location(f):
    """
    Caches the location on redis
    """
    @wraps(f)
    def decorated_function(*args):
        self = args[0]

        if self.redis:
            # try to get location from cache and set them
            cache_key = self.coordinates_redis_key()

            if cache_key:
                location = self.redis.hget(
                    'location.coordinates', cache_key)

                if location:
                    self.location = location
                    log.debug('%s location obtained from cache', location)
                    return

        # find the location
        f(*args)

        # save it on cache
        if self.location and self.redis:
            # set location on cache
            self.redis.hset('location.coordinates', cache_key,
                            self.location)

            log.debug('%s location setted in cache', self.location)
    return decorated_function
