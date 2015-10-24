import logging

import dill
from functools import wraps


log = logging.getLogger(__name__)


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
            self.redis.hset('text.artist', self.title, dill.dumps(self.artist))
            log.debug(
                'Setting artist (%s) for %s on cache',
                self.artist.name,
                self.title,
            )

    return decorated_function
