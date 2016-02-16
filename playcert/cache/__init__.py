import logging

import dill
from functools import wraps


log = logging.getLogger(__name__)


def cache_data_in_hash(f):
    """
    Caches the data on a redis hash
    """
    @wraps(f)
    def decorated_function(*args):
        self = args[0]

        if self.redis:
            data = self.redis.hget(self.cache_hash_key(), self.cache_key())
            data = dill.loads(data) if data else ''
            if data:
                log.debug('Obtained data for %s from cache', self.cache_key())
                return data

        data = f(*args)

        if data and self.redis:
            # set data on cache
            log.debug('Setting data on cache for %s', self.cache_key())
            self.redis.hset(self.cache_hash_key(),
                            self.cache_key(), dill.dumps(data))

        return data

    return decorated_function


def cache_data(name):
    """
    Caches data for playlist and for events
    """
    def wrapper(f):
        """
        Caches data on redis
        """
        @wraps(f)
        def decorated_function(**kwargs):
            request = kwargs['request']

            data_redis_key = "%s.%s.%s" % (
                kwargs['location'], name, kwargs['today'])

            # get data from redis
            data = request.redis.get(data_redis_key)
            data = dill.loads(data) if data else ''

            if data:
                log.debug('Obtained data from cache for %s', data_redis_key)
                return data

            # find the data
            data = f(**kwargs)

            if data:
                log.debug('Setting data on cache for %s', data_redis_key)
                # and set it on redis
                request.redis.set(data_redis_key, dill.dumps(data))

                return data
        return decorated_function
    return wrapper
