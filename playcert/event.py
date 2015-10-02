import artist


class Event:

    def __init__(self, title, when, venue):
        self.title = title
        self.when = when
        self.venue = venue

        # finds and creates artist from event title
        self.artist = artist.Artist.create_artist_from_text(title, venue)

    def __repr__(self):
        return 'Event(%s, %s, %s, %s)' % (self.title.encode('utf-8'), self.when.encode('utf-8'), self.venue.encode('utf-8'), self.artist)
