import io
import json
import unittest
from unittest.mock import Mock, patch
from backend.app.flashcards import service
import test_server_integration as integration


def deck():
    return {'id': 'fixture', 'name': 'English', 'color': '#a78bfa', 'cards': [
        {'id': 'word', 'front': 'important', 'back': 'quan trọng', 'language': 'en', 'color': '#fb7185'}]}


class FlashcardContractTest(unittest.TestCase):
    def test_all_colors_and_invalid_fallback(self):
        for color in service.COLORS:
            value = deck(); value['color'] = color; value['cards'][0]['color'] = color
            result = service.normalize_deck(value)
            self.assertEqual(result['color'], color); self.assertEqual(result['cards'][0]['color'], color)
        self.assertEqual(service.color('url(evil)'), service.DEFAULT_COLOR)
        self.assertEqual(service.color(None), service.DEFAULT_COLOR)

    def test_inherited_color_survives_deck_recolor_and_duplicate_ids_are_rejected(self):
        value = deck(); value['cards'][0].pop('color')
        result = service.normalize_deck(value)
        self.assertIsNone(result['cards'][0]['color'])
        result['color'] = '#4ade80'
        self.assertIsNone(service.normalize_deck(result)['cards'][0]['color'])
        result['cards'].append(dict(result['cards'][0]))
        with self.assertRaises(ValueError): service.normalize_deck(result)

    def test_bad_card_data(self):
        for value in (None, [], {}, {'name': 'x', 'cards': []}, {'name': 'x', 'cards': ['bad']}, {'name': 'x', 'cards': [{'front': 'x'}]}):
            with self.subTest(value=value), self.assertRaises(ValueError): service.normalize_deck(value)

    def test_suggestion_missing_fields(self):
        result = service.suggest('Tài liệu tiếng Việt\nDữ liệu hữu ích', 'vn.txt', Mock(complete_json=Mock(return_value={'title': 'Tiêu đề'})))
        self.assertEqual(result['suggestion']['name'], 'Tiêu đề'); self.assertTrue(result['warning'])

    def test_suggestion_errors_and_malformed_json_fall_back(self):
        for value in ('text', [], {'cards': 'broken'}, {'cards': []}):
            result = service.suggest('English material\nMeaning', 'en.txt', Mock(complete_json=Mock(return_value=value)))
            self.assertTrue(result['suggestion']['cards']); self.assertTrue(result['warning'])
        result = service.suggest('English material', 'en.txt', Mock(complete_json=Mock(side_effect=TimeoutError)))
        self.assertTrue(result['warning'])

    def test_valid_suggestion_preserves_metadata(self):
        value = {**deck(), 'description': 'Words', 'subject': 'English', 'keywords': ['important'], 'difficulty': 'intermediate'}
        result = service.suggest('important: quan trọng', 'en.txt', Mock(complete_json=Mock(return_value=value)))
        self.assertEqual(result['suggestion']['keywords'], ['important']); self.assertEqual(result['warning'], '')

    def test_empty_document(self):
        with self.assertRaises(ValueError): service.suggest('  \n', 'empty.txt', Mock())

    def test_pronunciation_case_phrase_and_audio(self):
        body = [{'phonetics': [{'text': '/test/', 'audio': 'https://api.dictionaryapi.dev/media/test.mp3'}]}]
        for term in ('Important', 'important', 'look up'):
            with patch.object(service, 'urlopen', return_value=io.BytesIO(json.dumps(body).encode())):
                result = service.pronunciation(term)
            self.assertEqual(result['pronunciation'], '/test/'); self.assertTrue(result['audioUrl'])

    def test_pronunciation_offline_and_no_audio(self):
        with patch.object(service, 'urlopen', side_effect=TimeoutError):
            self.assertEqual(service.pronunciation('nonexistent')['audioUrl'], '')
        with patch.object(service, 'urlopen', return_value=io.BytesIO(b'[{"phonetics":[{"text":"/x/"}]}]')):
            self.assertEqual(service.pronunciation('x')['pronunciation'], '/x/')
        self.assertEqual(service.audio_url('javascript:alert(1)'), '')


class FlashcardHTTPTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        integration.ServerIntegrationTest.setUpClass.__func__(cls)
    @classmethod
    def tearDownClass(cls):
        integration.ServerIntegrationTest.tearDownClass.__func__(cls)
    request = integration.ServerIntegrationTest.request
    login_cookie = integration.ServerIntegrationTest.login_cookie

    def test_auth_and_validation(self):
        self.assertEqual(self.request('/api/flashcards')[0], 401)
        self.assertEqual(self.request('/api/flashcards/pronunciation?term=hello')[0], 401)
        self.assertEqual(self.request('/api/flashcards/preview','POST',b'')[0], 401)
        self.assertEqual(self.request('/api/flashcards/missing/review','POST',{})[0], 401)
        self.assertEqual(self.request('/api/flashcards', 'POST', deck())[0], 401)
        cookie = self.login_cookie('student@studyhub.local', 'Student123!')
        self.assertEqual(self.request('/api/flashcards', 'POST', {'name': 'bad'}, {'Cookie': cookie})[0], 400)

    def test_database_round_trip_edit_delete_ownership_and_study(self):
        cookie = self.login_cookie('student@studyhub.local', 'Student123!'); headers = {'Cookie': cookie}
        other = {'Cookie': self.login_cookie('teacher@studyhub.local', 'Teacher123!')}
        status, _, created = self.request('/api/flashcards', 'POST', deck(), headers)
        self.assertEqual(status, 201); self.assertEqual(created['cards'][0]['color'], '#fb7185')
        self.assertEqual(self.request('/api/flashcards', headers=other)[2], [])
        self.assertEqual(self.request('/api/flashcards/fixture', 'DELETE', headers=other)[0], 404)
        self.assertEqual(self.request('/api/flashcards/fixture/review', 'POST', {'card_id': 'word','rating': 'known'}, other)[0], 404)
        created['description'] = 'User edit'; created['cards'][0]['color'] = 'bad'
        saved = self.request('/api/flashcards', 'POST', created, headers)[2]
        self.assertEqual(saved['cards'][0]['color'], service.DEFAULT_COLOR)
        self.assertEqual(self.request('/api/flashcards', headers=headers)[2][0]['description'], 'User edit')
        for rating in ('known','again'):
            status, _, result = self.request('/api/flashcards/fixture/review', 'POST', {'card_id': 'word', 'rating': rating}, headers)
            self.assertEqual(status, 200); self.assertEqual(result['streak']['current_streak'], 1)
        self.assertEqual(self.request('/api/flashcards/fixture', 'DELETE', headers=headers)[0], 200)
        self.assertEqual(self.request('/api/flashcards', headers=headers)[2], [])
        self.assertEqual(self.request('/api/flashcards', 'POST', deck(), headers)[0], 201)

    def test_preview_validation_and_no_implicit_save(self):
        cookie = self.login_cookie('teacher@studyhub.local', 'Teacher123!')
        def upload(name, content):
            body = b'--preview\r\nContent-Disposition: form-data; name="file"; filename="'+name.encode()+b'"\r\nContent-Type: application/octet-stream\r\n\r\n'+content+b'\r\n--preview--\r\n'
            return self.request('/api/flashcards/preview', 'POST', body, {'Cookie': cookie, 'Content-Type':'multipart/form-data; boundary=preview'})
        for name, content, expected in [('empty.txt',b'',400),('bad.exe',b'abc',400),('bad.pdf',b'broken',422),('white.txt',b'  ',422)]:
            self.assertEqual(upload(name,content)[0], expected)
        for name, content in [('vi.txt','Học tập\nÔn luyện hàng ngày'.encode()),('en.md',b'English\nImportant means significant.'),('long.txt',b'Learning\n'*10000)]:
            status, _, result = upload(name, content)
            self.assertEqual(status, 200); self.assertTrue(result['suggestion']['cards'])
        self.assertEqual(self.request('/api/flashcards', headers={'Cookie': cookie})[2], [])

    def test_preview_pdf_office_csv_and_size_limit(self):
        import zipfile
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        cookie = self.login_cookie('teacher@studyhub.local', 'Teacher123!')
        def upload(name, content):
            body = b'--file\r\nContent-Disposition: form-data; name="file"; filename="'+name.encode()+b'"\r\n\r\n'+content+b'\r\n--file--\r\n'
            return self.request('/api/flashcards/preview', 'POST', body, {'Cookie': cookie, 'Content-Type':'multipart/form-data; boundary=file'})
        writer = PdfWriter()
        for number in range(2):
            page = writer.add_blank_page(width=612, height=792)
            font = DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
            stream = DecodedStreamObject(); stream.set_data(f'BT /F1 12 Tf 50 700 Td (Page {number+1}: English study vocabulary) Tj ET'.encode())
            page[NameObject('/Contents')] = writer._add_object(stream)
        pdf = io.BytesIO(); writer.write(pdf)
        self.assertEqual(upload('pages.pdf', pdf.getvalue())[0], 200)
        formats = {
            'notes.docx': ('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Tiếng Việt: học tập hàng ngày.</w:t></w:r></w:p></w:body></w:document>'),
            'notes.pptx': ('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>English vocabulary</a:t></a:r></a:p></p:sld>'),
            'notes.xlsx': ('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="inlineStr"><is><t>English vocabulary</t></is></c></row></sheetData></worksheet>'),
        }
        for name, (entry, xml) in formats.items():
            content=io.BytesIO()
            with zipfile.ZipFile(content,'w') as archive: archive.writestr(entry,xml)
            with self.subTest(name=name): self.assertEqual(upload(name,content.getvalue())[0],200)
        self.assertEqual(upload('notes.csv',b'term,meaning\nhello,greeting')[0],200)
        self.assertEqual(upload('large.txt',b'x'*(20*1024*1024+1))[0],413)
        for name in ('broken.docx','broken.pptx','broken.xlsx','legacy.doc','legacy.ppt'):
            self.assertEqual(upload(name,b'broken')[0],422)
