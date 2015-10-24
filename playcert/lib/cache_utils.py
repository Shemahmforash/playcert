import logging

import dill
from functools import wraps


log = logging.getLogger(__name__)


def cache_songs(f):
    """
    Caches the songs on redis
    """
    @wraps(f)
    def decorated_function(*args):
        self = args[0]

        if self.redis:
            # try to get songs from cache and set them
            songs = self.redis.hget('artist.songs', self.name)
            songs = dill.loads(songs) if songs else ''

            log.debug('Trying to obtain %s songs from cache', self.name)

            if songs:
                self.songs = songs
                log.debug('%s songs obtained from cache', self.name)
                return

        # find the songs
        f(*args)

        # save them on cache
        if self.songs and self.redis:
            # set songs on cache
            self.redis.hset(
                'artist.songs', self.name, dill.dumps(self.songs))

            log.debug('%s songs setted in cache', self.name)
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


def cache_artist(f):
    """
    Caches the artist on redis
    """
    @wraps(f)
    def decorated_function(*args):
        self = args[0]

        if self.redis:
            artist_cache = self.redis.hget('text.artist', self.title)
            artist_cache = dill.loads(artist_cache) if artist_cache else ''
            if artist_cache:
                self.artist = artist_cache
                log.debug('Obtained artist for %s from cache', self.title)
                return

        f(*args)

        if self.artist and self.redis:
            # set artist on cache
            self.redis.hset(
                'text.artist', self.title, dill.dumps(self.artist))
            log.debug(
                'Setting artist (%s) for %s on cache', self.artist.name, self.title
            )

    return decorated_function
