import logging

from playcert.lib.artist import Artist
from playcert.cache.artists import cache_artist


log = logging.getLogger(__name__)


class Event(object):

    def __init__(self, title, when, venue, artist_name=None, redis=None):
        self.title = title
        self.when = when
        self.venue = venue

        # to use cache in this class (not mandatory)
        self.redis = redis

        if artist_name:
            log.debug(
                'No need to find artist name, already have it from eventful %s', artist_name)
            self.artist = Artist(artist_name, self.redis)
        else:
            # finds artist from event title
            self.find_artist()

    @cache_artist
    def find_artist(self):

        # finds and creates artist from event title
        self.artist = Artist.create_artist_from_text(
            self.title, self.venue, self.redis)

    def __repr__(self):
        return 'Event(%s, %s, %s, %s)' % \
            (self.title.encode('utf-8'), self.when.encode('utf-8'),
             self.venue.encode('utf-8'), self.artist)
