import artist


class Event:

    def __init__(self, title, when, venue):
        self.title = title
        self.when = when
        self.venue = venue

        # finds and creates artist from event title
        self.artist = artist.Artist.create_artist_from_text(title, venue)
