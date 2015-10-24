import logging

import dill
from functools import wraps


log = logging.getLogger(__name__)


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


