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