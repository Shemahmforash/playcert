import artist
import dill
import logging
from functools import wraps

log = logging.getLogger(__name__)


class Event:

    def __init__(self, title, when, venue, redis=None):
        self.title = title
        self.when = when
        self.venue = venue

        # to use cache in this class (not mandatory)
        if not redis is None:
            self.redis = redis

        # finds artist from event title
        self.find_artist()

    def cache_artist(f):
        '''
        Caches the artist on redis
        '''
        @wraps(f)
        def decorated_function(*args):
            self = args[0]

            if self.redis:
                artist_cache = self.redis.hget('text.artist', self.title)
                artist_cache = dill.loads(artist_cache) if artist_cache else ''
                if artist_cache:
                    self.artist = artist_cache
                    log.debug(
                        'Obtained artist for %s from cache', self.title)
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

    @cache_artist
    def find_artist(self):
        # finds and creates artist from event title
        self.artist = artist.Artist.create_artist_from_text(
            self.title, self.venue, self.redis)

    def __repr__(self):
        return 'Event(%s, %s, %s, %s)' % \
            (self.title.encode('utf-8'), self.when.encode('utf-8'),
             self.venue.encode('utf-8'), self.artist)
