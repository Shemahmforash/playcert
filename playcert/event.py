import artist
import dill


class Event:

    def __init__(self, title, when, venue, redis=None):
        self.title = title
        self.when = when
        self.venue = venue

        # if cache, try to get text artist from cache
        if redis:
            a = redis.hget('text.artist', self.title)
            a = dill.loads(a) if a else ''
            if a:
                self.artist = a
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
