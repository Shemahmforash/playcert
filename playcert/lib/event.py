import artist
import dill


class Event:

    def __init__(self, title, when, venue, redis=None):
        self.title = title
        self.when = when
        self.venue = venue

        # if cache, try to get text artist from cache
        if redis:
            artist_cache = redis.hget('text.artist', self.title)
            artist_cache = dill.loads(artist_cache) if artist_cache else ''
            if artist_cache:
                self.artist = artist_cache
                return

        # finds and creates artist from event title
        self.artist = artist.Artist.create_artist_from_text(
            title, venue, redis)

        # set artist and text correspondence on cache if there is cache
        if redis and self.artist:
            # set artist on cache
            redis.hset('text.artist', self.title, dill.dumps(self.artist))

    def __repr__(self):
        return 'Event(%s, %s, %s, %s)' % \
            (self.title.encode('utf-8'), self.when.encode('utf-8'),
             self.venue.encode('utf-8'), self.artist)
